import { supabase } from '../lib/supabase'
import type { InventoryItem, Kitchen, Recipe, StorageSpace } from '../types'

export type AppData = {
  kitchen: Kitchen
  spaces: StorageSpace[]
  items: InventoryItem[]
  recipes: Recipe[]
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

  const [spacesResult, itemsResult, recipesResult] = await Promise.all([
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
  ])

  if (spacesResult.error) throw spacesResult.error
  if (itemsResult.error) throw itemsResult.error
  if (recipesResult.error) throw recipesResult.error

  const items = (itemsResult.data || []) as InventoryItem[]
  const spaces = (spacesResult.data || []).map((space) => ({
    ...space,
    item_count: items.filter((item) => item.storage_space_id === space.id).length,
    expiring_count: items.filter((item) => item.storage_space_id === space.id && getDaysLeft(item) <= 3).length,
  })) as StorageSpace[]

  return { kitchen, spaces, items, recipes: (recipesResult.data || []) as Recipe[] }
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

export async function createStorageSpace(input: Partial<StorageSpace> & Pick<StorageSpace, 'kitchen_id' | 'name' | 'space_type'>) {
  const { data, error } = await supabase.from('storage_spaces').insert(input).select().single()
  if (error) throw error
  return data
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

export async function lookupBarcode(barcode: string) {
  const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}?fields=product_name,product_name_ko,brands,image_front_small_url,categories_tags`)
  if (!response.ok) return null
  const result = await response.json()
  if (!result?.product) return null
  return {
    name: result.product.product_name_ko || result.product.product_name || '',
    imageUrl: result.product.image_front_small_url || '',
    brand: result.product.brands || '',
  }
}
