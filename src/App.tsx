import { useEffect, useMemo, useState } from 'react'
import {
  Apple, Bell, BookOpen, Box, Camera, Check, ChevronRight, CircleUserRound,
  Clock3, DoorOpen, Home, LayoutGrid, LoaderCircle, LogOut, Map, PackageCheck, PenLine,
  PanelsTopLeft, Plus, Refrigerator, ScanLine, Search, Settings2, Snowflake, Sparkles, X,
} from 'lucide-react'
import { useAuth } from './contexts/AuthContext'
import { demoData } from './demoData'
import { isSupabaseConfigured } from './lib/supabase'
import {
  createInventoryItem, createStorageSpace, deleteStorageSpace, finishInventoryItem, getDaysLeft, loadAppData, lookupBarcode,
  moveInventoryItem, updateStorageSpaces, type AppData,
} from './services/kitchenService'
import { getInventoryImageUrl, uploadInventoryImage } from './services/imageService'
import type { InventoryItem, Recipe, StorageSpace } from './types'

type Tab = 'home' | 'map' | 'search' | 'recipes' | 'profile'

const spaceIcons: Record<string, React.ReactNode> = {
  fridge: <Refrigerator />, freezer: <Snowflake />, pantry: <LayoutGrid />,
  cabinet: <PanelsTopLeft />, under_sink: <DoorOpen />,
}

function App() {
  const { session, profile, loading, signInWithCredentials, signUpWithCredentials, signOut } = useAuth()
  const [demoMode, setDemoMode] = useState(false)
  const [data, setData] = useState<AppData>(demoData)
  const [dataLoading, setDataLoading] = useState(false)
  const [setupError, setSetupError] = useState('')
  const [tab, setTab] = useState<Tab>('home')
  const [addOpen, setAddOpen] = useState(false)
  const [query, setQuery] = useState('')

  const refresh = async () => {
    if (!profile || demoMode) return
    setDataLoading(true)
    try {
      setData(await loadAppData(profile.id))
      setSetupError('')
    } catch (error) {
      console.error(error)
      setSetupError('Supabase SQL을 먼저 실행해 주세요. 지금은 미리보기 데이터로 보여드려요.')
      setData(demoData)
    } finally {
      setDataLoading(false)
    }
  }

  useEffect(() => { refresh() }, [profile, demoMode]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <FullLoader />
  if (!session && !demoMode) return <LoginPage onSignIn={signInWithCredentials} onSignUp={signUpWithCredentials} onDemo={() => setDemoMode(true)} />

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="wordmark" onClick={() => setTab('home')}><span>집</span>에뭐있지</button>
        <div className="top-actions"><button aria-label="알림"><Bell /></button><button aria-label="설정" onClick={() => setTab('profile')}><CircleUserRound /></button></div>
      </header>

      {setupError && <div className="setup-banner">{setupError}</div>}
      {dataLoading ? <FullLoader compact /> : (
        <main className="screen">
          {tab === 'home' && <HomeScreen data={data} query={query} setQuery={setQuery} goSearch={() => setTab('search')} />}
          {tab === 'map' && <KitchenMap data={data} demoMode={demoMode} onChanged={refresh} />}
          {tab === 'search' && <SearchScreen data={data} query={query} setQuery={setQuery} profileId={profile?.id || 'demo-profile'} demoMode={demoMode} onChanged={refresh} />}
          {tab === 'recipes' && <RecipeScreen data={data} />}
          {tab === 'profile' && <ProfileScreen nickname={profile?.nickname || '미리보기 사용자'} demoMode={demoMode} onExitDemo={() => setDemoMode(false)} onSignOut={signOut} />}
        </main>
      )}

      <BottomNav tab={tab} setTab={setTab} onAdd={() => setAddOpen(true)} />
      {addOpen && <AddItemSheet data={data} profileId={profile?.id || 'demo-profile'} demoMode={demoMode} onClose={() => setAddOpen(false)} onSaved={async () => { setAddOpen(false); await refresh() }} />}
    </div>
  )
}

function LoginPage({ onSignIn, onSignUp, onDemo }: { onSignIn: (username: string, password: string) => Promise<void>; onSignUp: (username: string, password: string, nickname: string) => Promise<void>; onDemo: () => void }) {
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      if (mode === 'login') await onSignIn(username, password)
      else await onSignUp(username, password, nickname)
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : '처리하지 못했습니다.') }
    finally { setBusy(false) }
  }
  return <main className="login-page">
    <div className="login-visual"><div className="mini-pantry"><span>🍅</span><span>🥛</span><span>🥬</span><span>🍎</span></div><Refrigerator /></div>
    <p className="login-kicker">우리 집 식재료를 한눈에</p>
    <h1><span>집</span>에뭐있지</h1>
    <p>냉장고부터 팬트리까지<br />잊기 전에 기록하고, 버리기 전에 먹어요.</p>
    <div className="auth-tabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError('') }}>로그인</button><button className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError('') }}>회원가입</button></div>
    <form className="auth-form" onSubmit={submit}>
      {mode === 'signup' && <label><span>별칭</span><input autoComplete="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="앱에서 사용할 이름" /></label>}
      <label><span>아이디</span><input autoCapitalize="none" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="영문 소문자·숫자 4~20자" /></label>
      <label><span>비밀번호</span><input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8자 이상" /></label>
      {error && <p className="auth-error">{error}</p>}
      <button className="google-button" type="submit" disabled={busy || !isSupabaseConfigured}>{busy ? <LoaderCircle className="spin" /> : mode === 'login' ? '로그인' : '가입하고 시작하기'}</button>
    </form>
    <button className="demo-button" onClick={onDemo}>로그인 없이 둘러보기</button>
    {!isSupabaseConfigured && <small>Supabase 환경변수가 필요합니다.</small>}
  </main>
}

function HomeScreen({ data, query, setQuery, goSearch }: { data: AppData; query: string; setQuery: (v: string) => void; goSearch: () => void }) {
  const urgent = [...data.items].sort((a, b) => getDaysLeft(a) - getDaysLeft(b)).filter((item) => getDaysLeft(item) <= 3)
  const match = getRecipeMatch(data.recipes[0], data.items)
  return <>
    <section className="welcome"><div><p>오늘도 알뜰하게 👋</p><h1>{data.kitchen.name}</h1></div><span className="item-total">식재료 <b>{data.items.length}</b>개</span></section>
    <label className="global-search" onClick={goSearch}><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="식재료, 메모, 보관 위치 검색" /><Settings2 /></label>
    <SectionTitle title="오늘까지 먹어요" action={`${urgent.length}개 확인`} />
    <div className="expiry-scroll">{urgent.length ? urgent.map((item) => <ItemMiniCard item={item} key={item.id} />) : <EmptyMini />}</div>
    <SectionTitle title="오늘의 냉장고 털기" action="레시피 더보기" />
    <article className="recipe-hero"><div className="recipe-art">🍲</div><div><span className="eyebrow">임박 재료 우선</span><h2>{data.recipes[0]?.title || '첫 레시피를 등록해 보세요'}</h2><p>{data.recipes[0]?.summary}</p><div className="match-row"><Check /> 집에 있는 재료 {match.have}개</div></div><ChevronRight /></article>
    <SectionTitle title="우리 집 보관공간" action="주방맵 보기" />
    <div className="space-summary">{data.spaces.slice(0, 4).map((space) => <div key={space.id}><span>{spaceIcons[space.space_type] || <Box />}</span><b>{space.name}</b><small>{space.item_count || 0}개</small></div>)}</div>
  </>
}

function KitchenMap({ data, demoMode, onChanged }: { data: AppData; demoMode: boolean; onChanged: () => Promise<void> }) {
  const [selected, setSelected] = useState<StorageSpace | null>(null)
  const [spaces, setSpaces] = useState(data.spaces)
  const [editing, setEditing] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [formSpace, setFormSpace] = useState<StorageSpace | 'new' | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => setSpaces(data.spaces), [data.spaces])

  const updateDraft = (id: string, changes: Partial<StorageSpace>) => {
    setSpaces((current) => current.map((space) => space.id === id ? { ...space, ...changes } : space))
    setSelected((current) => current?.id === id ? { ...current, ...changes } : current)
  }

  const movePointer = (event: React.PointerEvent<HTMLButtonElement>, space: StorageSpace) => {
    if (!editing || draggingId !== space.id) return
    const map = event.currentTarget.parentElement
    if (!map) return
    const rect = map.getBoundingClientRect()
    const column = Math.max(0, Math.min(4 - space.map_width, Math.floor(((event.clientX - rect.left) / rect.width) * 4)))
    const row = Math.max(0, Math.min(5, Math.floor((event.clientY - rect.top) / 117)))
    updateDraft(space.id, { map_x: column, map_y: row })
  }

  const saveLayout = async () => {
    if (demoMode) { setEditing(false); return alert('미리보기에서는 배치가 화면에만 적용돼요.') }
    setBusy(true)
    try { await updateStorageSpaces(spaces); setEditing(false); await onChanged() }
    catch (error) { alert(error instanceof Error ? error.message : '주방맵을 저장하지 못했습니다.') }
    finally { setBusy(false) }
  }

  const removeSpace = async (space: StorageSpace) => {
    if ((space.item_count || 0) > 0) return alert('식재료가 들어 있는 공간은 삭제할 수 없어요. 먼저 다른 공간으로 이동해 주세요.')
    if (!window.confirm(`${space.name} 공간을 삭제할까요?`)) return
    if (demoMode) { setSpaces((current) => current.filter((item) => item.id !== space.id)); setFormSpace(null); return }
    await deleteStorageSpace(space.id); setFormSpace(null); await onChanged()
  }

  return <>
    <div className="page-heading"><div><p>{editing ? '블록을 끌어 배치하고 크기를 조절하세요' : '공간을 누르면 안이 펼쳐져요'}</p><h1>주방맵</h1></div>{editing ? <div className="map-edit-actions"><button onClick={() => { setSpaces(data.spaces); setEditing(false) }}>취소</button><button className="save" disabled={busy} onClick={saveLayout}>{busy ? <LoaderCircle className="spin" /> : <Check />} 저장</button></div> : <button className="icon-text" onClick={() => { setEditing(true); setSelected(null) }}><PenLine /> 편집</button>}</div>
    <div className="view-toggle"><button className="active">주방맵</button><button>목록 보기</button></div>
    <section className={`kitchen-map ${editing ? 'editing' : ''}`}>
      {spaces.map((space) => <button key={space.id} className={`map-block type-${space.space_type} ${draggingId === space.id ? 'dragging' : ''}`} style={{ gridColumn: `${space.map_x + 1} / span ${Math.max(1, space.map_width)}`, gridRow: `${space.map_y + 1} / span ${Math.max(1, space.map_height)}` }} onClick={() => editing ? setFormSpace(space) : setSelected(space)} onPointerDown={(event) => { if (!editing) return; setDraggingId(space.id); event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={(event) => movePointer(event, space)} onPointerUp={() => setDraggingId(null)}>
        {space.expiring_count ? <i>{space.expiring_count}</i> : null}<span>{spaceIcons[space.space_type] || <Box />}</span><b>{space.name}</b><small>{space.alias || `${space.item_count || 0}개 보관 중`}</small>
        {editing && <div className="resize-controls"><span title="가로 줄이기" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); updateDraft(space.id, { map_width: Math.max(1, space.map_width - 1) }) }}>↔−</span><span title="가로 늘이기" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); updateDraft(space.id, { map_width: Math.min(4 - space.map_x, space.map_width + 1) }) }}>↔+</span><span title="세로 줄이기" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); updateDraft(space.id, { map_height: Math.max(1, space.map_height - 1) }) }}>↕−</span><span title="세로 늘이기" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); updateDraft(space.id, { map_height: Math.min(4, space.map_height + 1) }) }}>↕+</span></div>}
      </button>)}
      <button className="map-add" onClick={() => setFormSpace('new')}><Plus /> 공간 추가</button>
    </section>
    <p className="map-tip"><Sparkles /> {editing ? '블록을 터치한 채 원하는 칸으로 끌어보세요. 블록을 누르면 이름과 정보를 수정할 수 있어요.' : '실제 주방 사진을 배경으로 넣는 기능은 다음 버전에서 추가할 예정이에요.'}</p>
    {selected && <div className="space-drawer"><div><span>{spaceIcons[selected.space_type]}</span><div><h2>{selected.name}</h2><p>{selected.alias || selected.memo || '별칭이나 메모가 없습니다.'}</p></div><button onClick={() => setSelected(null)}><X /></button></div>{data.items.filter((item) => item.storage_space_id === selected.id).map((item) => <ItemRow key={item.id} item={item} />)}</div>}
    {formSpace && <SpaceForm space={formSpace === 'new' ? null : formSpace} kitchenId={data.kitchen.id} demoMode={demoMode} onClose={() => setFormSpace(null)} onDelete={removeSpace} onSave={async (values) => {
      if (formSpace === 'new') {
        const newSpace = { ...values, id: `demo-${Date.now()}`, kitchen_id: data.kitchen.id, map_x: 0, map_y: 3, map_width: 1, map_height: 1, sort_order: spaces.length + 1, item_count: 0, expiring_count: 0 } as StorageSpace
        if (demoMode) setSpaces((current) => [...current, newSpace])
        else { await createStorageSpace({ ...values, kitchen_id: data.kitchen.id, name: String(values.name), space_type: String(values.space_type), map_x: 0, map_y: 3, map_width: 1, map_height: 1, sort_order: spaces.length + 1 }); await onChanged() }
      } else {
        updateDraft(formSpace.id, values)
      }
      setFormSpace(null)
    }} />}
  </>
}

function SpaceForm({ space, kitchenId, demoMode, onClose, onDelete, onSave }: { space: StorageSpace | null; kitchenId: string; demoMode: boolean; onClose: () => void; onDelete: (space: StorageSpace) => Promise<void>; onSave: (values: Partial<StorageSpace>) => Promise<void> }) {
  const [name, setName] = useState(space?.name || '')
  const [alias, setAlias] = useState(space?.alias || '')
  const [type, setType] = useState(space?.space_type || 'cabinet')
  const [memo, setMemo] = useState(space?.memo || '')
  const [busy, setBusy] = useState(false)
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (!name.trim()) return; setBusy(true); try { await onSave({ kitchen_id: kitchenId, name: name.trim(), alias: alias.trim() || null, space_type: type, memo: memo.trim() || null, color: space?.color || '#9DB89A', icon: type }) } finally { setBusy(false) } }
  return <div className="sheet-backdrop"><form className="space-form" onSubmit={submit}><div className="sheet-head"><div><p>{space ? '공간 정보를 바꿔보세요' : '새로운 보관공간'}</p><h2>{space ? '공간 수정' : '공간 추가'}</h2></div><button type="button" onClick={onClose}><X /></button></div><label><span>공간 이름 *</span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 간식 수납장" /></label><label><span>별칭</span><input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="예: 아일랜드 아래칸" /></label><label><span>공간 유형</span><select value={type} onChange={(e) => setType(e.target.value)}><option value="fridge">냉장실</option><option value="freezer">냉동실</option><option value="kimchi_fridge">김치냉장고</option><option value="cabinet">수납장</option><option value="pantry">팬트리</option><option value="under_sink">싱크대 하부장</option><option value="counter">조리대</option><option value="custom">사용자 정의</option></select></label><label><span>메모</span><textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="무엇을 보관하는 공간인지 적어두세요." /></label><button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Check />} {space ? '수정 적용' : '공간 추가'}</button>{space && <button type="button" className="delete-space" onClick={() => onDelete(space)} disabled={demoMode && false}>이 공간 삭제</button>}</form></div>
}

function SearchScreen({ data, query, setQuery, profileId, demoMode, onChanged }: { data: AppData; query: string; setQuery: (v: string) => void; profileId: string; demoMode: boolean; onChanged: () => Promise<void> }) {
  const [spaceFilter, setSpaceFilter] = useState('all')
  const results = useMemo(() => data.items.filter((item) => {
    const haystack = `${item.product_name} ${item.alias || ''} ${item.memo || ''} ${item.category || ''} ${item.storage_spaces?.name || ''}`.toLowerCase()
    return haystack.includes(query.toLowerCase()) && (spaceFilter === 'all' || item.storage_space_id === spaceFilter)
  }), [data.items, query, spaceFilter])

  const move = async (item: InventoryItem) => {
    const targetName = window.prompt(`어디로 이동할까요?\n${data.spaces.map((s) => s.name).join(', ')}`)
    const target = data.spaces.find((s) => s.name === targetName)
    if (!target || target.id === item.storage_space_id) return
    if (demoMode) return alert('미리보기에서는 실제 이동이 저장되지 않아요.')
    await moveInventoryItem(item, target.id, profileId); await onChanged()
  }
  const finish = async (item: InventoryItem) => {
    if (demoMode) return alert('미리보기에서는 실제 변경이 저장되지 않아요.')
    await finishInventoryItem(item.id, 'consumed'); await onChanged()
  }
  return <>
    <div className="page-heading"><div><p>집 안의 모든 식재료</p><h1>통합 검색</h1></div></div>
    <label className="global-search"><Search /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="상품명, 별칭, 메모를 검색하세요" />{query && <button onClick={() => setQuery('')}><X /></button>}</label>
    <div className="filter-chips"><button className={spaceFilter === 'all' ? 'active' : ''} onClick={() => setSpaceFilter('all')}>전체 {data.items.length}</button>{data.spaces.map((space) => <button className={spaceFilter === space.id ? 'active' : ''} onClick={() => setSpaceFilter(space.id)} key={space.id}>{space.name}</button>)}</div>
    <div className="result-count">검색 결과 <b>{results.length}</b>개</div>
    <div className="item-list">{results.map((item) => <article className="inventory-row" key={item.id}><ItemThumb item={item} /><div><h3>{item.product_name}</h3><p>{item.storage_spaces?.name} {item.storage_spaces?.alias ? `· ${item.storage_spaces.alias}` : ''}</p><small>{item.quantity}{item.unit} · {dateLabel(item)}</small></div><div className="row-actions"><button onClick={() => move(item)}>이동</button><button onClick={() => finish(item)}>소진</button></div></article>)}</div>
  </>
}

function RecipeScreen({ data }: { data: AppData }) {
  const [selected, setSelected] = useState<Recipe | null>(null)
  return <>
    <div className="page-heading"><div><p>있는 재료부터 맛있게</p><h1>레시피</h1></div><button className="icon-text"><BookOpen /> 저장됨</button></div>
    <article className="today-recipe"><div><span>오늘의 추천 레시피</span><h2>{data.recipes[0]?.title}</h2><p>{data.recipes[0]?.summary}</p><button onClick={() => setSelected(data.recipes[0])}>레시피 보기</button></div><div>🥘</div></article>
    <SectionTitle title="재료 보유 현황" action="내 식재료 기준" />
    <div className="ingredient-summary"><div><b>{getRecipeMatch(data.recipes[0], data.items).have}</b><span>집에 있어요</span></div><div><b>{getRecipeMatch(data.recipes[0], data.items).urgent}</b><span>곧 상할 재료</span></div><div><b>{getRecipeMatch(data.recipes[0], data.items).missing}</b><span>추가로 필요</span></div></div>
    <SectionTitle title="추천 레시피" action={`${data.recipes.length}개`} />
    <div className="recipe-list">{data.recipes.map((recipe) => { const match = getRecipeMatch(recipe, data.items); return <button key={recipe.id} onClick={() => setSelected(recipe)}><span>🍳</span><div><h3>{recipe.title}</h3><p>{recipe.summary}</p><small><Clock3 /> {recipe.cook_minutes || '-'}분 · 재료 {match.have}/{match.total}</small></div><ChevronRight /></button> })}</div>
    {selected && <RecipeDetail recipe={selected} items={data.items} onClose={() => setSelected(null)} />}
  </>
}

function AddItemSheet({ data, profileId, demoMode, onClose, onSaved }: { data: AppData; profileId: string; demoMode: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [mode, setMode] = useState<'barcode' | 'manual'>('barcode')
  const [busy, setBusy] = useState(false)
  const [barcode, setBarcode] = useState('')
  const [name, setName] = useState('')
  const [alias, setAlias] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('개')
  const [spaceId, setSpaceId] = useState(data.spaces[0]?.id || '')
  const [expiration, setExpiration] = useState('')
  const [useBy, setUseBy] = useState('')
  const [memo, setMemo] = useState('')
  const [category, setCategory] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')

  const findBarcode = async () => {
    if (!barcode) return
    setBusy(true)
    try { const found = await lookupBarcode(barcode); if (found) { setName(found.name); setPreview(found.imageUrl) } else alert('상품을 찾지 못했어요. 상품명을 직접 입력해 주세요.') } finally { setBusy(false) }
  }
  const save = async () => {
    if (!name.trim() || !spaceId) return alert('상품명과 보관 위치는 필수입니다.')
    if (demoMode) { alert('등록 흐름을 확인했어요. 로그인 후에는 실제로 저장됩니다.'); await onSaved(); return }
    setBusy(true)
    try {
      const imagePath = file ? await uploadInventoryImage(file, data.kitchen.id, profileId) : null
      await createInventoryItem({ kitchen_id: data.kitchen.id, storage_space_id: spaceId, created_by: profileId, product_name: name.trim(), alias: alias.trim() || null, barcode: barcode || null, image_path: imagePath, category: category || null, quantity: Number(quantity) || 1, unit, purchased_at: new Date().toISOString().slice(0, 10), opened_at: null, expiration_date: expiration || null, use_by_date: useBy || null, recommended_use_date: null, memo: memo.trim() || null, registration_method: mode })
      await onSaved()
    } catch (error) { alert(error instanceof Error ? error.message : '저장하지 못했습니다.') } finally { setBusy(false) }
  }
  return <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="add-sheet"><div className="sheet-handle" /><div className="sheet-head"><div><p>10초 안에 빠르게</p><h2>식재료 추가</h2></div><button onClick={onClose}><X /></button></div>
    <div className="mode-tabs"><button className={mode === 'barcode' ? 'active' : ''} onClick={() => setMode('barcode')}><ScanLine /> 바코드</button><button className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}><PenLine /> 직접 입력</button></div>
    {mode === 'barcode' && <div className="barcode-box"><ScanLine /><div><b>바코드 번호를 입력해 보세요</b><span>카메라 연속 스캔은 다음 단계에서 연결돼요.</span></div><div><input inputMode="numeric" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="880..." /><button onClick={findBarcode}>조회</button></div></div>}
    <label className="photo-field">{preview ? <img src={preview} /> : <Camera />}<span>{file ? file.name : '상품 사진 촬영 또는 선택'}</span><input type="file" accept="image/*" capture="environment" onChange={(e) => { const selected = e.target.files?.[0] || null; setFile(selected); if (selected) setPreview(URL.createObjectURL(selected)) }} /></label>
    <div className="form-grid"><label className="full"><span>상품명 *</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 사과" /></label><label><span>별칭</span><input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="아침용" /></label><label><span>카테고리</span><input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="과일" /></label><label><span>수량</span><input type="number" min="0" step="0.1" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label><label><span>단위</span><select value={unit} onChange={(e) => setUnit(e.target.value)}><option>개</option><option>팩</option><option>병</option><option>봉</option><option>g</option><option>kg</option><option>모</option></select></label><label className="full"><span>보관 위치 *</span><select value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>{data.spaces.map((space) => <option key={space.id} value={space.id}>{space.name}{space.alias ? ` · ${space.alias}` : ''}</option>)}</select></label><label><span>유통기한</span><input type="date" value={expiration} onChange={(e) => setExpiration(e.target.value)} /></label><label><span>소비기한</span><input type="date" value={useBy} onChange={(e) => setUseBy(e.target.value)} /></label><label className="full"><span>메모</span><textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="보관법이나 구입처를 적어두세요." /></label></div>
    <button className="primary-button" disabled={busy} onClick={save}>{busy ? <LoaderCircle className="spin" /> : <PackageCheck />} 저장하기</button>
  </section></div>
}

function RecipeDetail({ recipe, items, onClose }: { recipe: Recipe; items: InventoryItem[]; onClose: () => void }) {
  return <div className="sheet-backdrop"><section className="recipe-detail"><div className="sheet-head"><div><p>{recipe.cook_minutes}분 · {recipe.difficulty}</p><h2>{recipe.title}</h2></div><button onClick={onClose}><X /></button></div><p>{recipe.summary}</p><h3>재료</h3>{recipe.ingredients?.map((ingredient) => { const have = items.some((item) => normalize(item.product_name).includes(normalize(ingredient.ingredient_name))); return <div className={`recipe-ingredient ${have ? 'have' : ''}`} key={ingredient.ingredient_name}><span>{have ? <Check /> : <Plus />}</span><b>{ingredient.ingredient_name}</b><small>{ingredient.amount} · {have ? '집에 있어요' : '추가로 필요해요'}</small></div> })}<h3>만드는 법</h3><ol>{recipe.instructions.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol></section></div>
}

function ProfileScreen({ nickname, demoMode, onExitDemo, onSignOut }: { nickname: string; demoMode: boolean; onExitDemo: () => void; onSignOut: () => Promise<void> }) {
  return <><div className="page-heading"><div><p>반가워요</p><h1>{nickname}</h1></div></div><div className="profile-card"><CircleUserRound /><div><b>{nickname}</b><span>{demoMode ? '미리보기 모드' : 'Google 계정으로 연결됨'}</span></div></div><div className="settings-list"><button><Bell /><span><b>소비기한 알림</b><small>당일 · 1일 전 · 3일 전</small></span><ChevronRight /></button><button><Map /><span><b>내 주방 관리</b><small>보관공간 이름과 배치</small></span><ChevronRight /></button></div><button className="signout" onClick={demoMode ? onExitDemo : onSignOut}><LogOut /> {demoMode ? '로그인 화면으로' : '로그아웃'}</button></>
}

function BottomNav({ tab, setTab, onAdd }: { tab: Tab; setTab: (tab: Tab) => void; onAdd: () => void }) {
  const links: { id: Tab; label: string; icon: React.ReactNode }[] = [{ id: 'home', label: '홈', icon: <Home /> }, { id: 'map', label: '주방맵', icon: <Map /> }, { id: 'search', label: '검색', icon: <Search /> }, { id: 'recipes', label: '레시피', icon: <BookOpen /> }]
  return <nav className="bottom-nav">{links.slice(0, 2).map((link) => <button className={tab === link.id ? 'active' : ''} onClick={() => setTab(link.id)} key={link.id}>{link.icon}<span>{link.label}</span></button>)}<button className="add-button" onClick={onAdd} aria-label="식재료 추가"><Plus /></button>{links.slice(2).map((link) => <button className={tab === link.id ? 'active' : ''} onClick={() => setTab(link.id)} key={link.id}>{link.icon}<span>{link.label}</span></button>)}</nav>
}

function SectionTitle({ title, action }: { title: string; action: string }) { return <div className="section-title"><h2>{title}</h2><button>{action} <ChevronRight /></button></div> }
function ItemMiniCard({ item }: { item: InventoryItem }) { const days = getDaysLeft(item); return <article className="item-mini"><ItemThumb item={item} /><b>{item.product_name}</b><span>{item.storage_spaces?.name}</span><em className={days <= 0 ? 'danger' : ''}>{days <= 0 ? '오늘' : `${days}일`}</em></article> }
function ItemThumb({ item }: { item: InventoryItem }) { const url = getInventoryImageUrl(item.image_path); return <div className="item-thumb">{url ? <img src={url} /> : <Apple />}</div> }
function ItemRow({ item }: { item: InventoryItem }) { return <div className="drawer-item"><ItemThumb item={item} /><div><b>{item.product_name}</b><span>{item.quantity}{item.unit} · {dateLabel(item)}</span></div><ChevronRight /></div> }
function EmptyMini() { return <div className="empty-mini"><Check /> 오늘 바로 먹어야 할 식재료가 없어요.</div> }
function FullLoader({ compact = false }: { compact?: boolean }) { return <div className={`full-loader ${compact ? 'compact' : ''}`}><LoaderCircle className="spin" /><span>주방을 정리하고 있어요</span></div> }
function dateLabel(item: InventoryItem) { const days = getDaysLeft(item); if (!Number.isFinite(days)) return '기한 미설정'; if (days < 0) return `${Math.abs(days)}일 지남`; if (days === 0) return '오늘까지'; return `${days}일 남음` }
function normalize(value: string) { return value.replace(/\s/g, '').toLowerCase() }
function getRecipeMatch(recipe: Recipe | undefined, items: InventoryItem[]) { const ingredients = recipe?.ingredients || []; const matches = ingredients.map((ingredient) => items.find((item) => normalize(item.product_name).includes(normalize(ingredient.ingredient_name)) || normalize(ingredient.ingredient_name).includes(normalize(item.product_name)))); return { total: ingredients.length, have: matches.filter(Boolean).length, urgent: matches.filter((item) => item && getDaysLeft(item) <= 3).length, missing: matches.filter((item) => !item).length } }

export default App
