import type { AppData } from './services/kitchenService'

const isoAfter = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

export const demoData: AppData = {
  kitchen: { id: 'demo-kitchen', name: '우리 집 주방', owner_profile_id: 'demo-profile' },
  spaces: [
    { id: 'fridge', kitchen_id: 'demo-kitchen', name: '냉장실', alias: '큰 냉장고', space_type: 'fridge', memo: null, color: '#a8c9bd', icon: 'fridge', map_x: 0, map_y: 0, map_width: 1, map_height: 2, sort_order: 1, item_count: 5, expiring_count: 3 },
    { id: 'freezer', kitchen_id: 'demo-kitchen', name: '냉동실', alias: null, space_type: 'freezer', memo: null, color: '#a8c9bd', icon: 'snowflake', map_x: 0, map_y: 2, map_width: 1, map_height: 1, sort_order: 2, item_count: 2, expiring_count: 0 },
    { id: 'lower', kitchen_id: 'demo-kitchen', name: '싱크대 하부장', alias: '세제 옆', space_type: 'under_sink', memo: null, color: '#91aaa1', icon: 'cabinet', map_x: 1, map_y: 1, map_width: 2, map_height: 1, sort_order: 3, item_count: 4, expiring_count: 1 },
    { id: 'upper', kitchen_id: 'demo-kitchen', name: '상부장', alias: null, space_type: 'cabinet', memo: null, color: '#dec39d', icon: 'cabinet', map_x: 1, map_y: 0, map_width: 2, map_height: 1, sort_order: 4, item_count: 8, expiring_count: 0 },
    { id: 'pantry', kitchen_id: 'demo-kitchen', name: '팬트리', alias: '베란다 선반', space_type: 'pantry', memo: null, color: '#cba878', icon: 'shelves', map_x: 3, map_y: 0, map_width: 1, map_height: 3, sort_order: 5, item_count: 11, expiring_count: 1 },
  ],
  items: [
    { id: 'tomato', kitchen_id: 'demo-kitchen', storage_space_id: 'fridge', product_name: '토마토', alias: '샐러드용', barcode: null, image_path: null, category: '채소', quantity: 2, unit: '개', purchased_at: null, opened_at: null, expiration_date: null, use_by_date: null, recommended_use_date: isoAfter(0), memo: '아래 야채칸', status: 'active', created_at: new Date().toISOString(), storage_spaces: { id: 'fridge', name: '냉장실', alias: '큰 냉장고', space_type: 'fridge' } },
    { id: 'milk', kitchen_id: 'demo-kitchen', storage_space_id: 'fridge', product_name: '우유', alias: null, barcode: '8800000000000', image_path: null, category: '유제품', quantity: 1, unit: '개', purchased_at: null, opened_at: isoAfter(-2), expiration_date: isoAfter(1), use_by_date: null, recommended_use_date: null, memo: '도어 포켓', status: 'active', created_at: new Date().toISOString(), storage_spaces: { id: 'fridge', name: '냉장실', alias: '큰 냉장고', space_type: 'fridge' } },
    { id: 'tofu', kitchen_id: 'demo-kitchen', storage_space_id: 'fridge', product_name: '두부', alias: null, barcode: null, image_path: null, category: '두부/콩', quantity: 1, unit: '모', purchased_at: null, opened_at: null, expiration_date: null, use_by_date: isoAfter(2), recommended_use_date: null, memo: null, status: 'active', created_at: new Date().toISOString(), storage_spaces: { id: 'fridge', name: '냉장실', alias: '큰 냉장고', space_type: 'fridge' } },
    { id: 'beef', kitchen_id: 'demo-kitchen', storage_space_id: 'freezer', product_name: '소고기 국거리', alias: null, barcode: null, image_path: null, category: '육류', quantity: 1, unit: '팩', purchased_at: null, opened_at: null, expiration_date: null, use_by_date: isoAfter(18), recommended_use_date: null, memo: '한 번 먹을 양', status: 'active', created_at: new Date().toISOString(), storage_spaces: { id: 'freezer', name: '냉동실', alias: null, space_type: 'freezer' } },
    { id: 'onion', kitchen_id: 'demo-kitchen', storage_space_id: 'pantry', product_name: '양파', alias: null, barcode: null, image_path: null, category: '채소', quantity: 4, unit: '개', purchased_at: null, opened_at: null, expiration_date: null, use_by_date: null, recommended_use_date: isoAfter(7), memo: '망에 보관', status: 'active', created_at: new Date().toISOString(), storage_spaces: { id: 'pantry', name: '팬트리', alias: '베란다 선반', space_type: 'pantry' } },
  ],
  recipes: [
    { id: 'recipe-1', title: '두부김치 볶음', summary: '임박한 두부를 가장 맛있게 비우는 15분 요리', image_url: null, cook_minutes: 15, difficulty: '쉬움', instructions: ['두부의 물기를 제거해 노릇하게 굽습니다.', '김치와 양파를 볶습니다.', '두부와 함께 담아냅니다.'], ingredients: [{ ingredient_name: '두부', amount: '1모', is_optional: false }, { ingredient_name: '김치', amount: '한 줌', is_optional: false }, { ingredient_name: '양파', amount: '1/2개', is_optional: true }] },
    { id: 'recipe-2', title: '토마토 달걀볶음', summary: '무르기 전 토마토로 만드는 빠른 한 끼', image_url: null, cook_minutes: 12, difficulty: '쉬움', instructions: ['달걀을 먼저 부드럽게 익힙니다.', '토마토를 센 불에 볶습니다.', '달걀을 다시 넣고 간합니다.'], ingredients: [{ ingredient_name: '토마토', amount: '2개', is_optional: false }, { ingredient_name: '달걀', amount: '3개', is_optional: false }] },
  ],
  savedRecipeIds: [],
  notifications: [],
}
