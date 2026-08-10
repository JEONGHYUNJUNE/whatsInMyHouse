import { supabase } from '../lib/supabase'
import type { AppNotification, InventoryItem, Kitchen, KitchenMap, Recipe, StorageSpace } from '../types'

export type AppData = {
  kitchen: Kitchen
  maps: KitchenMap[]
  spaces: StorageSpace[]
  items: InventoryItem[]
  recipes: Recipe[]
  savedRecipeIds: string[]
  notifications: AppNotification[]
}

export async function loadAppData(profileId: string): Promise<AppData> {
  const { data: membership, error: membershipError } = await supabase
    .from('kitchen_members')
    .select('kitchen_id, kitchens(id, name, owner_profile_id)')
    .eq('profile_id', profileId)
    .order('created_at')
    .limit(1)
    .single()

  if (membershipError) throw membershipError
  const kitchen = membership.kitchens as unknown as Kitchen

  const [mapsResult, spacesResult, itemsResult, recipesResult, savedRecipesResult, notificationsResult] = await Promise.all([
    supabase.from('kitchen_maps').select('*').eq('kitchen_id', kitchen.id).order('sort_order'),
    supabase.from('storage_spaces').select('*').eq('kitchen_id', kitchen.id).order('sort_order'),
    supabase
      .from('inventory_items')
      .select('*, storage_spaces(id, name, alias, space_type)')
      .eq('kitchen_id', kitchen.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
    supabase
      .from('recipes')
      .select('*, ingredients:recipe_ingredients(ingredient_name, amount, is_optional)')
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
    supabase.from('saved_recipes').select('recipe_id').eq('profile_id', profileId),
    supabase.from('notifications').select('id, profile_id, title, message, is_read, created_at').eq('profile_id', profileId).order('created_at', { ascending: false }).limit(30),
  ])

  if (mapsResult.error) throw mapsResult.error
  if (spacesResult.error) throw spacesResult.error
  if (itemsResult.error) throw itemsResult.error
  if (recipesResult.error) throw recipesResult.error
  if (savedRecipesResult.error) throw savedRecipesResult.error
  if (notificationsResult.error) throw notificationsResult.error

  const items = (itemsResult.data || []) as InventoryItem[]
  const spaces = (spacesResult.data || []).map((space) => ({
    ...space,
    item_count: items.filter((item) => item.storage_space_id === space.id).length,
    expiring_count: items.filter((item) => item.storage_space_id === space.id && getDaysLeft(item) <= 3).length,
  })) as StorageSpace[]

  return {
    kitchen,
    maps: (mapsResult.data || []) as KitchenMap[],
    spaces,
    items,
    recipes: (recipesResult.data || []) as Recipe[],
    savedRecipeIds: (savedRecipesResult.data || []).map((row) => row.recipe_id),
    notifications: (notificationsResult.data || []) as AppNotification[],
  }
}

export function getDaysLeft(item: InventoryItem) {
  const target = item.use_by_date || item.expiration_date || item.recommended_use_date
  if (!target) return Number.POSITIVE_INFINITY
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(`${target}T00:00:00`).getTime() - today.getTime()) / 86400000)
}

export async function createInventoryItem(input: Omit<InventoryItem, 'id' | 'created_at' | 'status' | 'storage_spaces'>) {
  const { data, error } = await supabase.from('inventory_items').insert({ ...input, status: 'active' }).select().single()
  if (error) throw error
  return data
}

export async function updateInventoryItem(itemId: string, input: Partial<InventoryItem>) {
  const { storage_spaces: _storageSpace, ...values } = input
  const { data, error } = await supabase.from('inventory_items').update(values).eq('id', itemId).select().single()
  if (error) throw error
  return data
}

export async function moveInventoryItem(item: InventoryItem, nextSpaceId: string, profileId: string) {
  const { error } = await supabase.rpc('move_inventory_item', {
    target_item_id: item.id,
    next_storage_space_id: nextSpaceId,
    actor_profile_id: profileId,
  })
  if (error) throw error
}

export async function finishInventoryItem(itemId: string, status: 'consumed' | 'discarded') {
  const { error } = await supabase.from('inventory_items').update({ status, finished_at: new Date().toISOString() }).eq('id', itemId)
  if (error) throw error
}

export async function consumeInventoryItems(entries: { item: InventoryItem; amount: number }[]) {
  const results = await Promise.all(entries.map(({ item, amount }) => {
    const quantity = Math.max(0, Number(item.quantity) - amount)
    return supabase.from('inventory_items').update(quantity <= 0
      ? { quantity: 0, status: 'consumed', finished_at: new Date().toISOString() }
      : { quantity }).eq('id', item.id)
  }))
  const error = results.find((result) => result.error)?.error
  if (error) throw error
}

export async function createStorageSpace(input: Partial<StorageSpace> & Pick<StorageSpace, 'kitchen_id' | 'name' | 'space_type'>) {
  const { data, error } = await supabase.from('storage_spaces').insert(input).select().single()
  if (error) throw error
  return data
}

export async function createKitchenMap(kitchenId: string, name: string, sortOrder: number) {
  const { data, error } = await supabase.from('kitchen_maps').insert({ kitchen_id: kitchenId, name, sort_order: sortOrder }).select().single()
  if (error) throw error
  return data as KitchenMap
}

export async function updateKitchenMap(mapId: string, name: string) {
  const { error } = await supabase.from('kitchen_maps').update({ name }).eq('id', mapId)
  if (error) throw error
}

export async function deleteKitchenMap(mapId: string) {
  const { error } = await supabase.from('kitchen_maps').delete().eq('id', mapId)
  if (error) throw error
}

export async function updateStorageSpace(spaceId: string, input: Partial<StorageSpace>) {
  const { data, error } = await supabase.from('storage_spaces').update(input).eq('id', spaceId).select().single()
  if (error) throw error
  return data
}

export async function updateKitchenName(kitchenId: string, name: string) {
  const { error } = await supabase.from('kitchens').update({ name }).eq('id', kitchenId)
  if (error) throw error
}

export async function updateProfileNickname(profileId: string, nickname: string) {
  const { error } = await supabase.from('profiles').update({ nickname }).eq('id', profileId)
  if (error) throw error
}

export async function toggleSavedRecipe(profileId: string, recipeId: string, isSaved: boolean) {
  const query = isSaved
    ? supabase.from('saved_recipes').delete().eq('profile_id', profileId).eq('recipe_id', recipeId)
    : supabase.from('saved_recipes').insert({ profile_id: profileId, recipe_id: recipeId })
  const { error } = await query
  if (error) throw error
}

export async function markNotificationsRead(profileId: string) {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('profile_id', profileId).eq('is_read', false)
  if (error) throw error
}

export async function updateStorageSpaces(spaces: StorageSpace[]) {
  const updates = spaces.map((space) => supabase
    .from('storage_spaces')
    .update({
      name: space.name,
      alias: space.alias,
      space_type: space.space_type,
      memo: space.memo,
      color: space.color,
      icon: space.icon,
      map_id: space.map_id,
      map_x: space.map_x,
      map_y: space.map_y,
      map_width: space.map_width,
      map_height: space.map_height,
      sort_order: space.sort_order,
    })
    .eq('id', space.id))
  const results = await Promise.all(updates)
  const error = results.find((result) => result.error)?.error
  if (error) throw error
}

export async function deleteStorageSpace(spaceId: string) {
  const { error } = await supabase.from('storage_spaces').delete().eq('id', spaceId)
  if (error) throw error
}

export async function rememberCatalogProduct(input: { barcode: string; name: string; brand?: string; category?: string; unit?: string; imageUrl?: string; profileId?: string; source: 'open_food_facts' | 'foodsafety_korea' }) {
  const existing = await supabase.from('product_catalog').select('id, product_name, brand, category, default_unit, image_url, data_source').eq('barcode', input.barcode).neq('data_source', 'user').maybeSingle()
  if (existing.data) return existing.data
  const inserted = await supabase.from('product_catalog').insert({
    barcode: input.barcode,
    product_name: input.name,
    brand: input.brand || null,
    category: input.category || null,
    default_unit: input.unit || '개',
    image_url: input.imageUrl || null,
    data_source: input.source,
    created_by: input.profileId && input.profileId !== 'demo-profile' ? input.profileId : null,
  }).select('id, product_name, brand, category, default_unit, image_url, data_source').single()
  if (inserted.error?.code === '23505') {
    const retry = await supabase.from('product_catalog').select('id, product_name, brand, category, default_unit, image_url, data_source').eq('barcode', input.barcode).single()
    if (retry.error) throw retry.error
    return retry.data
  }
  if (inserted.error) throw inserted.error
  return inserted.data
}

export async function lookupBarcode(barcode: string, profileId?: string, kitchenId?: string) {
  if (kitchenId) {
    let householdQuery = supabase.from('inventory_items').select('product_name, category, unit, image_path, catalog_product_id').eq('kitchen_id', kitchenId).eq('barcode', barcode)
    if (profileId && profileId !== 'demo-profile') householdQuery = householdQuery.eq('created_by', profileId)
    const household = await householdQuery.order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (household.data) {
      const storedImage = household.data.image_path || ''
      const imageUrl = /^https?:\/\//i.test(storedImage) ? storedImage : storedImage ? supabase.storage.from('inventory-images').getPublicUrl(storedImage).data.publicUrl : ''
      return { catalogId: household.data.catalog_product_id || null, name: household.data.product_name, imageUrl, brand: '', category: household.data.category || '', unit: household.data.unit || '개', source: 'household' }
    }
  }
  const local = await supabase.from('product_catalog').select('id, product_name, brand, category, default_unit, image_url, data_source').eq('barcode', barcode).neq('data_source', 'user').maybeSingle()
  if (local.data) return { catalogId: local.data.id, name: local.data.product_name, imageUrl: local.data.image_url || '', brand: local.data.brand || '', category: local.data.category || '', unit: local.data.default_unit || '개', source: local.data.data_source }

  const [{ data: foodSafety }, openFoodFacts] = await Promise.all([
    supabase.functions.invoke('barcode-lookup', { body: { barcode } }).catch(() => ({ data: null })),
    fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}?fields=product_name,product_name_ko,brands,image_front_small_url,categories_tags`)
      .then((response) => response.ok ? response.json() : null).catch(() => null),
  ])
  const offProduct = openFoodFacts?.product || null
  const name = foodSafety?.found ? foodSafety.name : offProduct?.product_name_ko || offProduct?.product_name || ''
  if (!name) return null
  const offCategory = String(offProduct?.categories_tags?.[0] || '').replace(/^[a-z]{2}:/, '').replaceAll('-', ' ')
  const source = foodSafety?.found ? 'foodsafety_korea' as const : 'open_food_facts' as const
  const brand = foodSafety?.found ? foodSafety.brand || '' : offProduct?.brands || ''
  const category = foodSafety?.found ? foodSafety.category || offCategory : offCategory
  const imageUrl = offProduct?.image_front_small_url || ''
  let catalogId: string | null = null
  if (profileId && profileId !== 'demo-profile') {
    const saved = await rememberCatalogProduct({ barcode, name, brand, category, imageUrl, profileId, source })
    catalogId = saved.id
  }
  return { catalogId, name, imageUrl, brand, category, unit: '개', source }
}
