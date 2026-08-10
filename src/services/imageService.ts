import { supabase } from '../lib/supabase'

const bucket = 'inventory-images'

export async function uploadInventoryImage(file: File, kitchenId: string, profileId: string) {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 올릴 수 있습니다.')
  if (file.size > 10 * 1024 * 1024) throw new Error('이미지는 10MB 이하만 가능합니다.')

  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${kitchenId}/${profileId}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, { cacheControl: '31536000' })
  if (error) throw error
  return path
}

export function getInventoryImageUrl(path: string | null) {
  if (!path) return ''
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}
