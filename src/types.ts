export type Profile = {
  id: string
  auth_user_id: string
  username?: string | null
  nickname: string
  avatar_url: string | null
}

export type Kitchen = {
  id: string
  name: string
  owner_profile_id: string
}

export type StorageSpace = {
  id: string
  kitchen_id: string
  name: string
  alias: string | null
  space_type: string
  memo: string | null
  color: string
  icon: string
  map_x: number
  map_y: number
  map_width: number
  map_height: number
  sort_order: number
  item_count?: number
  expiring_count?: number
}

export type InventoryItem = {
  id: string
  kitchen_id: string
  storage_space_id: string
  catalog_product_id?: string | null
  created_by?: string | null
  product_name: string
  alias: string | null
  barcode: string | null
  image_path: string | null
  category: string | null
  quantity: number
  unit: string
  purchased_at: string | null
  opened_at: string | null
  expiration_date: string | null
  use_by_date: string | null
  recommended_use_date: string | null
  memo: string | null
  registration_method?: 'manual' | 'barcode' | 'bulk' | 'photo'
  status: 'active' | 'consumed' | 'discarded'
  created_at: string
  storage_spaces?: Pick<StorageSpace, 'id' | 'name' | 'alias' | 'space_type'> | null
}

export type Recipe = {
  id: string
  title: string
  summary: string | null
  image_url: string | null
  cook_minutes: number | null
  difficulty: string | null
  instructions: string[]
  ingredients?: { ingredient_name: string; amount: string | null; is_optional: boolean }[]
}

export type AppNotification = {
  id: string
  profile_id: string
  title: string
  message: string
  is_read: boolean
  created_at: string
}
