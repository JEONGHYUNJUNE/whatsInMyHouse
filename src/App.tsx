import { useEffect, useMemo, useRef, useState } from 'react'
import type { IScannerControls } from '@zxing/browser'
import {
  Apple, Beef, Bell, BookOpen, Box, Camera, Carrot, Check, ChevronRight, CircleUserRound, Cookie, CookingPot, CupSoda,
  Clock3, DoorOpen, Egg, Fish, Home, LayoutGrid, List, LoaderCircle, LogOut, Map, Milk, Package, PackageCheck, PenLine,
  PanelsTopLeft, Plus, Refrigerator, ScanLine, Search, Settings2, ShieldCheck, Snowflake, Sparkles, Trash2, UtensilsCrossed, Wheat, X,
} from 'lucide-react'
import { useAuth } from './contexts/AuthContext'
import { demoData } from './demoData'
import { isSupabaseConfigured } from './lib/supabase'
import {
  approveBarcodeProduct, consumeInventoryItems, createInventoryItem, createKitchenMap, createStorageSpace, deleteKitchenMap, deleteStorageSpace, finishInventoryItem, getDaysLeft, loadAppData, loadBarcodeProductSubmissions, lookupBarcode,
  markNotificationsRead, moveInventoryItem, rejectBarcodeProduct, submitBarcodeProduct, toggleSavedRecipe, updateKitchenName, updateProfileNickname, updateStorageSpace,
  updateInventoryItem, updateKitchenMap, updateStorageSpaces, type AppData,
} from './services/kitchenService'
import { getInventoryImageUrl, uploadInventoryImage } from './services/imageService'
import type { AppNotification, BarcodeProductSubmission, InventoryItem, KitchenMap as KitchenMapPage, Profile, Recipe, StorageSpace } from './types'
import './onboarding.css'

type Tab = 'home' | 'map' | 'search' | 'consume' | 'recipes' | 'profile'

const spaceIcons: Record<string, React.ReactNode> = {
  fridge: <Refrigerator />, freezer: <Snowflake />, pantry: <LayoutGrid />,
  cabinet: <PanelsTopLeft />, under_sink: <DoorOpen />,
}

const categoryOptions = ['채소', '과일', '육류', '수산물', '달걀', '유제품', '곡류/면', '음료', '조미료/소스', '간식', '냉동식품', '기타']

function App() {
  const { session, profile, loading, signInWithCredentials, signUpWithCredentials, signOut, refreshProfile } = useAuth()
  const [demoMode, setDemoMode] = useState(false)
  const [data, setData] = useState<AppData | null>(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [setupError, setSetupError] = useState('')
  const [tab, setTab] = useState<Tab>('home')
  const [addOpen, setAddOpen] = useState(false)
  const [addTargetSpaceId, setAddTargetSpaceId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)

  const refresh = async () => {
    if (!profile || demoMode) return
    setDataLoading(true)
    try {
      setData(await loadAppData(profile.id))
      setSetupError('')
    } catch (error) {
      console.error(error)
      setSetupError('주방 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
      setData(null)
    } finally {
      setDataLoading(false)
    }
  }

  useEffect(() => {
    if (demoMode) {
      setData(demoData)
      setDataLoading(false)
      setSetupError('')
      return
    }
    if (profile) void refresh()
  }, [profile, demoMode]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <FullLoader />
  if (!session && !demoMode) return <LoginPage onSignIn={signInWithCredentials} onSignUp={signUpWithCredentials} onDemo={() => setDemoMode(true)} />

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="wordmark" onClick={() => setTab('home')}><span>집</span>에뭐있지</button>
        <div className="top-actions"><button className="notification-trigger" aria-label="알림" onClick={() => setNotificationsOpen(true)}><Bell />{data?.notifications.some((item) => !item.is_read) && <i />}</button><button aria-label="설정" onClick={() => setTab('profile')}><CircleUserRound /></button></div>
      </header>

      {setupError && <div className="setup-banner">{setupError}</div>}
      {dataLoading ? <FullLoader compact /> : !data ? (
        <main className="screen"><DataLoadError onRetry={refresh} /></main>
      ) : !demoMode && data.spaces.length === 0 ? (
        <main className="screen"><KitchenSetup kitchenId={data.kitchen.id} mapId={data.maps[0]?.id || ''} onCreated={refresh} /></main>
      ) : (
        <main className="screen">
          {tab === 'home' && <HomeScreen data={data} query={query} setQuery={setQuery} goSearch={() => setTab('search')} onSelectItem={setSelectedItem} onAdd={(spaceId) => { setAddTargetSpaceId(spaceId || null); setAddOpen(true) }} />}
          {tab === 'map' && <KitchenMap data={data} demoMode={demoMode} onSelectItem={setSelectedItem} onAdd={(spaceId) => { setAddTargetSpaceId(spaceId); setAddOpen(true) }} onChanged={refresh} />}
          {tab === 'search' && <SearchScreen data={data} query={query} setQuery={setQuery} profileId={profile?.id || 'demo-profile'} demoMode={demoMode} onSelectItem={setSelectedItem} onChanged={refresh} />}
          {tab === 'consume' && <ConsumptionScreen data={data} demoMode={demoMode} onChanged={refresh} />}
          {tab === 'recipes' && <RecipeScreen data={data} profileId={profile?.id || 'demo-profile'} demoMode={demoMode} onChanged={refresh} />}
          {tab === 'profile' && <ProfileScreen profile={profile} kitchenName={data.kitchen.name} kitchenId={data.kitchen.id} demoMode={demoMode} onExitDemo={() => setDemoMode(false)} onSignOut={signOut} onGoMap={() => setTab('map')} onGoRecipes={() => setTab('recipes')} onOpenNotifications={() => setNotificationsOpen(true)} onChanged={async () => { await refreshProfile(); await refresh() }} />}
        </main>
      )}

      {data && (demoMode || data.spaces.length > 0) && <BottomNav tab={tab} setTab={setTab} onAdd={() => { setAddTargetSpaceId(null); setAddOpen(true) }} />}
      {addOpen && data && data.spaces.length > 0 && <AddItemSheet data={data} initialSpaceId={addTargetSpaceId} profileId={profile?.id || 'demo-profile'} demoMode={demoMode} onClose={() => setAddOpen(false)} onSaved={async () => { setAddOpen(false); await refresh() }} />}
      {notificationsOpen && <NotificationsSheet notifications={data?.notifications || []} demoMode={demoMode} profileId={profile?.id || ''} onClose={() => setNotificationsOpen(false)} onRead={refresh} />}
      {selectedItem && data && <ItemDetailSheet item={selectedItem} spaces={data.spaces} demoMode={demoMode} onClose={() => setSelectedItem(null)} onSaved={async () => { setSelectedItem(null); await refresh() }} />}
    </div>
  )
}

function KitchenSetup({ kitchenId, mapId, onCreated }: { kitchenId: string; mapId: string; onCreated: () => Promise<void> }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('fridge')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return setError('공간 이름을 입력해 주세요.')
    setBusy(true)
    setError('')
    try {
      await createStorageSpace({
        kitchen_id: kitchenId,
        map_id: mapId,
        name: name.trim(),
        space_type: type,
        color: type === 'fridge' || type === 'freezer' ? '#BFD3CB' : '#EAD3AE',
        icon: type,
        map_x: 0,
        map_y: 0,
        map_width: 1,
        map_height: 1,
        sort_order: 1,
      })
      await onCreated()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '공간을 만들지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="kitchen-setup">
    <div className="setup-icon"><Map /></div>
    <p className="login-kicker">첫 번째 단계</p>
    <h1>식재료를 보관할<br />공간부터 만들어 볼까요?</h1>
    <p>실제 집에 있는 냉장고, 냉동실, 수납장처럼<br />식재료를 넣어둘 공간을 하나 등록해 주세요.</p>
    <form onSubmit={submit}>
      <label><span>공간 이름</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 거실 냉장고" /></label>
      <label><span>공간 유형</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="fridge">냉장실</option><option value="freezer">냉동실</option><option value="kimchi_fridge">김치냉장고</option><option value="cabinet">수납장</option><option value="pantry">팬트리</option><option value="under_sink">싱크대 하부장</option><option value="counter">조리대</option><option value="custom">사용자 정의</option></select></label>
      {error && <p className="auth-error">{error}</p>}
      <button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Plus />} 첫 공간 만들기</button>
    </form>
    <small>공간을 만든 다음 식재료를 등록할 수 있어요.</small>
  </section>
}

function DataLoadError({ onRetry }: { onRetry: () => Promise<void> }) {
  return <section className="data-error"><Box /><h2>주방을 불러오지 못했어요</h2><p>데모 데이터는 표시하지 않았습니다.<br />연결 상태를 확인하고 다시 시도해 주세요.</p><button onClick={() => void onRetry()}>다시 시도</button></section>
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

function HomeScreen({ data, query, setQuery, goSearch, onAdd, onSelectItem }: { data: AppData; query: string; setQuery: (v: string) => void; goSearch: () => void; onAdd: (spaceId?: string) => void; onSelectItem: (item: InventoryItem) => void }) {
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null)
  const [spaceView, setSpaceView] = useState<'list' | 'map'>('list')
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)
  const [activeMapId, setActiveMapId] = useState(data.maps[0]?.id || '')
  const spaceDetailRef = useRef<HTMLElement | null>(null)
  const urgent = [...data.items].sort((a, b) => getDaysLeft(a) - getDaysLeft(b)).filter((item) => getDaysLeft(item) <= 7)
  const recommendedRecipes = getRecommendedRecipes(data.recipes, data.items)
  const dailyRecipe = recommendedRecipes[0]
  const match = getRecipeMatch(dailyRecipe, data.items)
  const selectedSpace = data.spaces.find((space) => space.id === selectedSpaceId) || null
  const selectedItems = selectedSpace ? data.items.filter((item) => item.storage_space_id === selectedSpace.id) : []
  const activeMapSpaces = data.spaces.filter((space) => space.map_id === activeMapId)
  const selectSpace = (spaceId: string) => setSelectedSpaceId((current) => current === spaceId ? null : spaceId)
  useEffect(() => {
    if (!data.maps.some((map) => map.id === activeMapId)) setActiveMapId(data.maps[0]?.id || '')
  }, [data.maps, activeMapId])
  useEffect(() => {
    if (!selectedSpaceId) return
    const frame = window.requestAnimationFrame(() => {
      spaceDetailRef.current?.focus({ preventScroll: true })
      spaceDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [selectedSpaceId])
  const spaces = <>
    <div className="home-space-view-toggle" role="group" aria-label="보관공간 보기 방식"><button className={spaceView === 'list' ? 'active' : ''} onClick={() => setSpaceView('list')}><LayoutGrid /> 목록</button><button className={spaceView === 'map' ? 'active' : ''} onClick={() => setSpaceView('map')}><Map /> 주방맵</button></div>
    {spaceView === 'list' ? <div className="space-summary">{data.spaces.map((space) => <button className={selectedSpaceId === space.id ? 'selected' : ''} key={space.id} onClick={() => selectSpace(space.id)}><span>{spaceIcons[space.space_type] || <Box />}</span><b>{space.name}</b><small>{space.item_count || 0}개</small></button>)}</div> : <><MapPageTabs maps={data.maps} activeMapId={activeMapId} onSelect={(mapId) => { setActiveMapId(mapId); setSelectedSpaceId(null) }} /><section className="home-kitchen-map">{activeMapSpaces.map((space) => <button key={space.id} className={`map-block type-${space.space_type} ${selectedSpaceId === space.id ? 'selected' : ''}`} style={{ gridColumn: `${space.map_x + 1} / span ${Math.max(1, space.map_width)}`, gridRow: `${space.map_y + 1} / span ${Math.max(1, space.map_height)}` }} onClick={() => selectSpace(space.id)}>{space.expiring_count ? <i>{space.expiring_count}</i> : null}<span>{spaceIcons[space.space_type] || <Box />}</span><b>{space.name}</b><small>{space.alias || `${space.item_count || 0}개 보관 중`}</small></button>)}</section>{activeMapSpaces.length === 0 && <p className="empty-map-message">이 맵에는 아직 보관공간이 없어요.</p>}</>}
    {selectedSpace && <section ref={spaceDetailRef} tabIndex={-1} className="home-space-detail space-focus-target"><div className="home-space-detail-head"><div><span>{spaceIcons[selectedSpace.space_type] || <Box />}</span><div><h3>{selectedSpace.name}</h3><p>{selectedSpace.alias || selectedSpace.memo || `${selectedItems.length}개의 식재료를 보관 중이에요.`}</p></div></div><button onClick={() => onAdd(selectedSpace.id)}><Plus /> 이 공간에 추가</button></div>{selectedItems.length ? <div className="home-space-items">{selectedItems.map((item) => <ItemRow key={item.id} item={item} onClick={() => onSelectItem(item)} />)}</div> : <div className="home-space-empty"><PackageCheck /><p>아직 보관한 식재료가 없어요.</p><button onClick={() => onAdd(selectedSpace.id)}>첫 식재료 추가하기</button></div>}</section>}
  </>
  if (data.items.length === 0) return <>
    <section className="welcome"><div><p>주방 공간이 준비됐어요 👋</p><h1>{data.kitchen.name}</h1></div><span className="item-total">식재료 <b>0</b>개</span></section>
    <section className="empty-inventory-home"><div><PackageCheck /></div><h2>아직 등록한 식재료가 없어요</h2><p>아래 보관공간을 선택하면<br />그 공간에 첫 식재료를 추가할 수 있어요.</p></section>
    <SectionTitle title="만든 보관공간" action={`${data.spaces.length}개`} />
    {spaces}
  </>
  return <>
    <section className="welcome"><div><p>오늘도 알뜰하게 👋</p><h1>{data.kitchen.name}</h1></div><span className="item-total">식재료 <b>{data.items.length}</b>개</span></section>
    <label className="global-search" onClick={goSearch}><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="식재료, 메모, 보관 위치 검색" /><Settings2 /></label>
    <SectionTitle title="먼저 먹어요" action={`7일 안에 ${urgent.length}개`} />
    <div className="expiry-scroll">{urgent.length ? urgent.map((item) => <ItemMiniCard item={item} onClick={() => onSelectItem(item)} key={item.id} />) : <EmptyMini />}</div>
    <SectionTitle title="우리 집 보관공간" action={`${data.spaces.length}개`} />
    {spaces}
    <SectionTitle title="오늘의 냉장고 털기" action="보유 재료 기준" />
    <article className="recipe-hero clickable" role="button" tabIndex={0} onClick={() => dailyRecipe && setSelectedRecipe(dailyRecipe)} onKeyDown={(event) => { if (event.key === 'Enter' && dailyRecipe) setSelectedRecipe(dailyRecipe) }}><div className="recipe-art">🍲</div><div><span className="eyebrow">임박 재료 우선 · 매일 새로운 추천</span><h2>{dailyRecipe?.title || '첫 레시피를 등록해 보세요'}</h2><p>{dailyRecipe?.summary}</p><div className="match-row"><Check /> 집에 있는 재료 {match.have}개</div></div><ChevronRight /></article>
    {selectedRecipe && <RecipeDetail recipe={selectedRecipe} items={data.items} saved={data.savedRecipeIds.includes(selectedRecipe.id)} onClose={() => setSelectedRecipe(null)} />}
  </>
}

function KitchenMap({ data, demoMode, onSelectItem, onAdd, onChanged }: { data: AppData; demoMode: boolean; onSelectItem: (item: InventoryItem) => void; onAdd: (spaceId: string) => void; onChanged: () => Promise<void> }) {
  const [selected, setSelected] = useState<StorageSpace | null>(null)
  const [spaces, setSpaces] = useState(data.spaces)
  const [maps, setMaps] = useState(data.maps)
  const [activeMapId, setActiveMapId] = useState(data.maps[0]?.id || '')
  const [editing, setEditing] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [formSpace, setFormSpace] = useState<StorageSpace | 'new' | null>(null)
  const [formMap, setFormMap] = useState<KitchenMapPage | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<'map' | 'list'>('map')
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const didDragRef = useRef(false)
  const spaceDrawerRef = useRef<HTMLDivElement | null>(null)

  const activeMap = maps.find((map) => map.id === activeMapId) || maps[0]
  const activeMapSpaces = spaces.filter((space) => space.map_id === activeMap?.id)

  useEffect(() => setSpaces(data.spaces), [data.spaces])
  useEffect(() => {
    setMaps(data.maps)
    setActiveMapId((current) => data.maps.some((map) => map.id === current) ? current : data.maps[0]?.id || '')
  }, [data.maps])
  useEffect(() => {
    if (!selected || editing) return
    const frame = window.requestAnimationFrame(() => {
      spaceDrawerRef.current?.focus({ preventScroll: true })
      spaceDrawerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [selected, editing])

  const updateDraft = (id: string, changes: Partial<StorageSpace>) => {
    setSpaces((current) => current.map((space) => space.id === id ? { ...space, ...changes } : space))
    setSelected((current) => current?.id === id ? { ...current, ...changes } : current)
  }

  const overlapsAnotherSpace = (candidate: StorageSpace) => spaces.some((other) => {
    if (other.id === candidate.id) return false
    if (other.map_id !== candidate.map_id) return false
    return candidate.map_x < other.map_x + other.map_width
      && candidate.map_x + candidate.map_width > other.map_x
      && candidate.map_y < other.map_y + other.map_height
      && candidate.map_y + candidate.map_height > other.map_y
  })

  const updateGeometry = (space: StorageSpace, changes: Partial<StorageSpace>) => {
    const candidate = { ...space, ...changes }
    if (overlapsAnotherSpace(candidate)) return false
    updateDraft(space.id, changes)
    return true
  }

  const findEmptyPosition = (mapId = activeMapId) => {
    for (let row = 0; row < 12; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        const occupied = spaces.some((space) => space.map_id === mapId && column < space.map_x + space.map_width && column + 1 > space.map_x && row < space.map_y + space.map_height && row + 1 > space.map_y)
        if (!occupied) return { map_x: column, map_y: row }
      }
    }
    return { map_x: 0, map_y: 12 }
  }

  const movePointer = (event: React.PointerEvent<HTMLButtonElement>, space: StorageSpace) => {
    if (!editing || draggingId !== space.id) return
    const start = dragStartRef.current
    if (!start) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 7) return
    didDragRef.current = true
    const map = event.currentTarget.parentElement
    if (!map) return
    const rect = map.getBoundingClientRect()
    const column = Math.max(0, Math.min(4 - space.map_width, Math.floor(((event.clientX - rect.left) / rect.width) * 4)))
    const row = Math.max(0, Math.min(12 - space.map_height, Math.floor((event.clientY - rect.top) / 117)))
    updateGeometry(space, { map_x: column, map_y: row })
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

  const addMap = async (name: string) => {
    if (maps.some((map) => map.name === name)) return alert('이미 같은 이름의 맵이 있어요.')
    if (demoMode) {
      const next = { id: `demo-map-${Date.now()}`, kitchen_id: data.kitchen.id, name, sort_order: maps.length + 1 }
      setMaps((current) => [...current, next]); setActiveMapId(next.id); setSelected(null); setFormMap(null); return
    }
    try { const next = await createKitchenMap(data.kitchen.id, name, maps.length + 1); setActiveMapId(next.id); setSelected(null); setFormMap(null); await onChanged() }
    catch (error) { alert(error instanceof Error ? error.message : '맵을 추가하지 못했습니다.') }
  }

  const renameMap = async (name: string) => {
    if (!activeMap) return
    if (!name || name === activeMap.name) return
    if (maps.some((map) => map.id !== activeMap.id && map.name === name)) return alert('이미 같은 이름의 맵이 있어요.')
    if (demoMode) { setMaps((current) => current.map((map) => map.id === activeMap.id ? { ...map, name } : map)); setFormMap(null); return }
    try { await updateKitchenMap(activeMap.id, name); setFormMap(null); await onChanged() }
    catch (error) { alert(error instanceof Error ? error.message : '맵 이름을 수정하지 못했습니다.') }
  }

  const removeMap = async () => {
    if (!activeMap) return
    if (maps.length <= 1) return alert('주방맵은 최소 한 개가 필요해요.')
    if (activeMapSpaces.length > 0) return alert('보관공간이 있는 맵은 삭제할 수 없어요. 공간을 다른 맵으로 옮겨주세요.')
    if (!window.confirm(`${activeMap.name} 맵을 삭제할까요?`)) return
    const nextMap = maps.find((map) => map.id !== activeMap.id)
    if (demoMode) setMaps((current) => current.filter((map) => map.id !== activeMap.id))
    else { try { await deleteKitchenMap(activeMap.id); await onChanged() } catch (error) { return alert(error instanceof Error ? error.message : '맵을 삭제하지 못했습니다.') } }
    setActiveMapId(nextMap?.id || ''); setSelected(null)
  }

  return <>
    <div className="page-heading"><div><p>{editing ? '블록을 끌어 배치하고 크기를 조절하세요' : '공간을 누르면 안이 펼쳐져요'}</p><h1>주방 관리</h1></div>{view === 'map' && (editing ? <div className="map-edit-actions"><button onClick={() => { setSpaces(data.spaces); setEditing(false) }}>취소</button><button className="save" disabled={busy} onClick={saveLayout}>{busy ? <LoaderCircle className="spin" /> : <Check />} 저장</button></div> : <button className="icon-text" onClick={() => { setEditing(true); setSelected(null) }}><PenLine /> 배치 편집</button>)}</div>
    <div className="view-toggle"><button className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}><Map /> 주방맵</button><button className={view === 'list' ? 'active' : ''} onClick={() => { setView('list'); setEditing(false) }}><List /> 목록 보기</button></div>
    {view === 'map' && <div className="map-page-toolbar"><MapPageTabs maps={maps} activeMapId={activeMap?.id || ''} onSelect={(mapId) => { setActiveMapId(mapId); setSelected(null); setEditing(false) }} onAdd={() => setFormMap('new')} /><div className="map-page-actions"><button onClick={() => activeMap && setFormMap(activeMap)}><PenLine /> 이름</button><button onClick={() => void removeMap()}><X /> 삭제</button></div></div>}
    {view === 'map' ? <section className={`kitchen-map ${editing ? 'editing' : ''}`}>
      {activeMapSpaces.map((space) => <button key={space.id} className={`map-block type-${space.space_type} ${draggingId === space.id ? 'dragging' : ''}`} style={{ gridColumn: `${space.map_x + 1} / span ${Math.max(1, space.map_width)}`, gridRow: `${space.map_y + 1} / span ${Math.max(1, space.map_height)}` }} onClick={() => { if (didDragRef.current) { didDragRef.current = false; return } editing ? setFormSpace(space) : setSelected(space) }} onPointerDown={(event) => { if (!editing) return; didDragRef.current = false; dragStartRef.current = { x: event.clientX, y: event.clientY }; setDraggingId(space.id); event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={(event) => movePointer(event, space)} onPointerUp={() => { setDraggingId(null); dragStartRef.current = null; if (didDragRef.current) window.setTimeout(() => { didDragRef.current = false }, 0) }} onPointerCancel={() => { setDraggingId(null); dragStartRef.current = null; didDragRef.current = false }}>
        {space.expiring_count ? <i>{space.expiring_count}</i> : null}<span>{spaceIcons[space.space_type] || <Box />}</span><b>{space.name}</b><small>{space.alias || `${space.item_count || 0}개 보관 중`}</small>
        {editing && <div className="resize-controls"><span title="가로 줄이기" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); updateGeometry(space, { map_width: Math.max(1, space.map_width - 1) }) }}>↔−</span><span title="가로 늘이기" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); updateGeometry(space, { map_width: Math.min(4 - space.map_x, space.map_width + 1) }) }}>↔+</span><span title="세로 줄이기" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); updateGeometry(space, { map_height: Math.max(1, space.map_height - 1) }) }}>↕−</span><span title="세로 늘이기" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); updateGeometry(space, { map_height: Math.min(6, space.map_height + 1) }) }}>↕+</span></div>}
      </button>)}
      <button className="map-add" onClick={() => setFormSpace('new')}><Plus /> 공간 추가</button>
    </section> : <section className="space-list-view">
      {spaces.map((space) => { const spaceItems = data.items.filter((item) => item.storage_space_id === space.id); return <article key={space.id}><button className="space-list-main" onClick={() => setSelected(selected?.id === space.id ? null : space)}><span>{spaceIcons[space.space_type] || <Box />}</span><div><h2>{space.name}</h2><p>{space.alias || space.memo || '별칭이나 메모 없음'}</p></div><strong>{spaceItems.length}개</strong><ChevronRight /></button><button className="space-list-edit" aria-label={`${space.name} 수정`} onClick={() => setFormSpace(space)}><PenLine /></button></article> })}
      <button className="list-add-space" onClick={() => setFormSpace('new')}><Plus /> 보관공간 추가</button>
    </section>}
    {view === 'map' && <p className="map-tip"><Sparkles /> {editing ? '블록을 터치한 채 원하는 칸으로 끌어보세요. 블록을 누르면 이름과 정보를 수정할 수 있어요.' : '배치 편집에서 공간의 위치와 크기를 실제 주방처럼 정리할 수 있어요.'}</p>}
    {selected && <div ref={spaceDrawerRef} tabIndex={-1} className="space-drawer space-focus-target"><div><span>{spaceIcons[selected.space_type] || <Box />}</span><div><h2>{selected.name}</h2><p>{selected.alias || selected.memo || '별칭이나 메모가 없습니다.'}</p></div><button onClick={() => setSelected(null)}><X /></button></div><button className="space-drawer-add" onClick={() => onAdd(selected.id)}><Plus /> {selected.name}에 식재료 추가</button>{data.items.filter((item) => item.storage_space_id === selected.id).length ? data.items.filter((item) => item.storage_space_id === selected.id).map((item) => <ItemRow key={item.id} item={item} onClick={() => onSelectItem(item)} />) : <p className="empty-space-message">이 공간에 등록된 식재료가 없어요.</p>}</div>}
    {formSpace && <SpaceForm space={formSpace === 'new' ? null : formSpace} maps={maps} initialMapId={activeMap?.id || ''} kitchenId={data.kitchen.id} demoMode={demoMode} onClose={() => setFormSpace(null)} onDelete={removeSpace} onSave={async (values) => {
      if (formSpace === 'new') {
        const targetMapId = String(values.map_id || activeMapId)
        const emptyPosition = findEmptyPosition(targetMapId)
        const newSpace = { ...values, id: `demo-${Date.now()}`, kitchen_id: data.kitchen.id, ...emptyPosition, map_width: 1, map_height: 1, sort_order: spaces.length + 1, item_count: 0, expiring_count: 0 } as StorageSpace
        if (demoMode) setSpaces((current) => [...current, newSpace])
        else { await createStorageSpace({ ...values, kitchen_id: data.kitchen.id, name: String(values.name), space_type: String(values.space_type), ...emptyPosition, map_width: 1, map_height: 1, sort_order: spaces.length + 1 }); await onChanged() }
      } else if (demoMode) {
        const geometry = values.map_id !== formSpace.map_id ? findEmptyPosition(String(values.map_id)) : {}
        updateDraft(formSpace.id, { ...values, ...geometry })
      } else {
        const geometry = values.map_id !== formSpace.map_id ? findEmptyPosition(String(values.map_id)) : {}
        await updateStorageSpace(formSpace.id, { ...values, ...geometry })
        await onChanged()
      }
      setFormSpace(null)
    }} />}
    {formMap && <MapForm map={formMap === 'new' ? null : formMap} defaultName={`새 공간 ${maps.length + 1}`} onClose={() => setFormMap(null)} onSave={(name) => formMap === 'new' ? addMap(name) : renameMap(name)} />}
  </>
}

function MapForm({ map, defaultName, onClose, onSave }: { map: KitchenMapPage | null; defaultName: string; onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState(map?.name || defaultName)
  const [busy, setBusy] = useState(false)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try { await onSave(name.trim()) } finally { setBusy(false) }
  }
  return <div className="sheet-backdrop"><form className="simple-sheet map-form" onSubmit={submit}><div className="sheet-head"><div><p>{map ? '탭에 표시되는 이름입니다' : '공간별로 맵을 나눠보세요'}</p><h2>{map ? '주방맵 이름 수정' : '새 주방맵 추가'}</h2></div><button type="button" onClick={onClose}><X /></button></div><label><span>맵 이름</span><input autoFocus maxLength={30} value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 베란다, 창고" /></label><button className="primary-button" disabled={busy || !name.trim()}>{busy ? <LoaderCircle className="spin" /> : <Check />} {map ? '이름 저장' : '맵 만들기'}</button></form></div>
}

function SpaceForm({ space, maps, initialMapId, kitchenId, demoMode, onClose, onDelete, onSave }: { space: StorageSpace | null; maps: KitchenMapPage[]; initialMapId: string; kitchenId: string; demoMode: boolean; onClose: () => void; onDelete: (space: StorageSpace) => Promise<void>; onSave: (values: Partial<StorageSpace>) => Promise<void> }) {
  const [name, setName] = useState(space?.name || '')
  const [alias, setAlias] = useState(space?.alias || '')
  const [type, setType] = useState(space?.space_type || 'cabinet')
  const [memo, setMemo] = useState(space?.memo || '')
  const [mapId, setMapId] = useState(space?.map_id || initialMapId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return setError('공간 이름을 입력해 주세요.')
    if (!mapId) return setError('공간을 표시할 주방맵을 선택해 주세요.')
    setBusy(true); setError('')
    try {
      await onSave({ kitchen_id: kitchenId, map_id: mapId, name: name.trim(), alias: alias.trim() || null, space_type: type, memo: memo.trim() || null, color: space?.color || '#9DB89A', icon: type })
    } catch (nextError) {
      const databaseError = nextError as { code?: string; message?: string }
      setError(databaseError.code === '23505' ? '이미 같은 이름의 보관공간이 있어요. 다른 이름을 입력해 주세요.' : databaseError.message || '공간을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally { setBusy(false) }
  }
  return <div className="sheet-backdrop"><form className="space-form" onSubmit={submit}><div className="sheet-head"><div><p>{space ? '공간 정보를 바꿔보세요' : '새로운 보관공간'}</p><h2>{space ? '공간 수정' : '공간 추가'}</h2></div><button type="button" onClick={onClose}><X /></button></div><label><span>공간 이름 *</span><input autoFocus value={name} onChange={(e) => { setName(e.target.value); setError('') }} placeholder="예: 간식 수납장" /></label><label><span>표시할 주방맵</span><select value={mapId} onChange={(e) => { setMapId(e.target.value); setError('') }}>{maps.map((map) => <option value={map.id} key={map.id}>{map.name}</option>)}</select></label><label><span>별칭</span><input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="예: 아일랜드 아래칸" /></label><label><span>공간 유형</span><select value={type} onChange={(e) => setType(e.target.value)}><option value="fridge">냉장실</option><option value="freezer">냉동실</option><option value="kimchi_fridge">김치냉장고</option><option value="cabinet">수납장</option><option value="pantry">팬트리</option><option value="under_sink">싱크대 하부장</option><option value="counter">조리대</option><option value="custom">사용자 정의</option></select></label><label><span>메모</span><textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="무엇을 보관하는 공간인지 적어두세요." /></label>{error && <p className="form-error">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Check />} {space ? '수정 적용' : '공간 추가'}</button>{space && <button type="button" className="delete-space" onClick={() => onDelete(space)} disabled={demoMode && false}>이 공간 삭제</button>}</form></div>
}

function SearchScreen({ data, query, setQuery, profileId, demoMode, onSelectItem, onChanged }: { data: AppData; query: string; setQuery: (v: string) => void; profileId: string; demoMode: boolean; onSelectItem: (item: InventoryItem) => void; onChanged: () => Promise<void> }) {
  const [spaceFilter, setSpaceFilter] = useState('all')
  const [movingItem, setMovingItem] = useState<InventoryItem | null>(null)
  const results = useMemo(() => data.items.filter((item) => {
    const haystack = `${item.product_name} ${item.alias || ''} ${item.memo || ''} ${item.category || ''} ${item.storage_spaces?.name || ''}`.toLowerCase()
    return haystack.includes(query.toLowerCase()) && (spaceFilter === 'all' || item.storage_space_id === spaceFilter)
  }), [data.items, query, spaceFilter])

  const move = async (item: InventoryItem, targetId: string) => {
    if (targetId === item.storage_space_id) return setMovingItem(null)
    if (demoMode) { setMovingItem(null); return alert('미리보기에서는 실제 이동이 저장되지 않아요.') }
    await moveInventoryItem(item, targetId, profileId); setMovingItem(null); await onChanged()
  }
  const finish = async (item: InventoryItem, status: 'consumed' | 'discarded') => {
    if (demoMode) return alert('미리보기에서는 실제 변경이 저장되지 않아요.')
    if (!window.confirm(`${item.product_name}을(를) ${status === 'consumed' ? '소진' : '폐기'} 처리할까요?`)) return
    await finishInventoryItem(item.id, status); await onChanged()
  }
  return <>
    <div className="page-heading"><div><p>집 안의 모든 식재료</p><h1>통합 검색</h1></div></div>
    <label className="global-search"><Search /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="상품명, 별칭, 메모를 검색하세요" />{query && <button onClick={() => setQuery('')}><X /></button>}</label>
    <div className="filter-chips"><button className={spaceFilter === 'all' ? 'active' : ''} onClick={() => setSpaceFilter('all')}>전체 {data.items.length}</button>{data.spaces.map((space) => <button className={spaceFilter === space.id ? 'active' : ''} onClick={() => setSpaceFilter(space.id)} key={space.id}>{space.name}</button>)}</div>
    <div className="result-count">검색 결과 <b>{results.length}</b>개</div>
    <div className="item-list">{results.length ? results.map((item) => <article className="inventory-row" key={item.id} role="button" tabIndex={0} onClick={() => onSelectItem(item)} onKeyDown={(event) => { if (event.key === 'Enter') onSelectItem(item) }}><ItemThumb item={item} /><div><h3>{item.product_name}</h3><p>{item.storage_spaces?.name} {item.storage_spaces?.alias ? `· ${item.storage_spaces.alias}` : ''}</p><small>{item.quantity}{item.unit} · {dateLabel(item)}</small></div><div className="row-actions"><button onClick={(event) => { event.stopPropagation(); setMovingItem(item) }}>이동</button><button onClick={(event) => { event.stopPropagation(); void finish(item, 'consumed') }}>소진</button><button onClick={(event) => { event.stopPropagation(); void finish(item, 'discarded') }}>폐기</button></div></article>) : <div className="no-results"><Search /><p>{query ? '검색 결과가 없어요.' : '등록된 식재료가 없어요.'}</p></div>}</div>
    {movingItem && <MoveItemSheet item={movingItem} spaces={data.spaces} onClose={() => setMovingItem(null)} onMove={(targetId) => move(movingItem, targetId)} />}
  </>
}

function ItemDetailSheet({ item, spaces, demoMode, onClose, onSaved }: { item: InventoryItem; spaces: StorageSpace[]; demoMode: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState(item.product_name)
  const [alias, setAlias] = useState(item.alias || '')
  const [category, setCategory] = useState(item.category || '')
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [unit, setUnit] = useState(item.unit)
  const [spaceId, setSpaceId] = useState(item.storage_space_id)
  const [deadlineType, setDeadlineType] = useState<'use_by' | 'expiration'>(item.expiration_date ? 'expiration' : 'use_by')
  const [deadlineDate, setDeadlineDate] = useState(item.expiration_date || item.use_by_date || '')
  const [memo, setMemo] = useState(item.memo || '')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState(getInventoryImageUrl(item.image_path))
  const space = spaces.find((candidate) => candidate.id === item.storage_space_id)

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !spaceId) return alert('상품명과 보관 위치는 필수입니다.')
    if (demoMode) return alert('미리보기에서는 수정 내용이 저장되지 않아요.')
    setBusy(true)
    try {
      const imagePath = file ? await uploadInventoryImage(file, item.kitchen_id, item.created_by || 'profile') : item.image_path
      await updateInventoryItem(item.id, { product_name: name.trim(), alias: alias.trim() || null, category: category.trim() || null, quantity: Number(quantity) || 1, unit, storage_space_id: spaceId, expiration_date: deadlineType === 'expiration' ? deadlineDate || null : null, use_by_date: deadlineType === 'use_by' ? deadlineDate || null : null, memo: memo.trim() || null, image_path: imagePath })
      await onSaved()
    } catch (error) { alert(error instanceof Error ? error.message : '상품을 수정하지 못했습니다.') }
    finally { setBusy(false) }
  }

  return <div className="sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="item-detail-sheet"><div className="sheet-handle" /><div className="sheet-head"><div><p>{space?.name || '보관 위치 미지정'} · {dateLabel(item)}</p><h2>{editing ? '상품 수정' : item.product_name}</h2></div><button type="button" onClick={onClose}><X /></button></div>
    {!editing ? <><div className="item-detail-hero">{preview ? <img src={preview} alt="" /> : <div className={`category-${getItemCategoryVisual(item).key}`}>{getItemCategoryVisual(item).icon}</div>}<div><span>{item.category || '카테고리 없음'}</span><b>{item.quantity}{item.unit}</b><small>{item.alias || '별칭 없음'}</small></div></div><dl className="item-detail-info"><div><dt>보관 위치</dt><dd>{space?.name || '-'}</dd></div><div><dt>유통기한</dt><dd>{item.expiration_date || '-'}</dd></div><div><dt>소비기한</dt><dd>{item.use_by_date || '-'}</dd></div><div><dt>바코드</dt><dd>{item.barcode || '-'}</dd></div><div className="full"><dt>메모</dt><dd>{item.memo || '등록된 메모가 없습니다.'}</dd></div></dl><button className="primary-button" onClick={() => setEditing(true)}><PenLine /> 상품 정보 수정</button></> : <form onSubmit={save}><label className="photo-field">{preview ? <img src={preview} alt="" /> : <Camera />}<span>{file ? file.name : '상품 사진 변경'}</span><input type="file" accept="image/*" capture="environment" onChange={(event) => { const selected = event.target.files?.[0] || null; setFile(selected); if (selected) setPreview(URL.createObjectURL(selected)) }} /></label><div className="form-grid"><label className="full"><span>상품명 *</span><input value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>별칭</span><input value={alias} onChange={(event) => setAlias(event.target.value)} /></label><CategoryField value={category} onChange={setCategory} /><label><span>수량</span><input type="number" min="0" step="0.1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label><span>단위</span><select value={unit} onChange={(event) => setUnit(event.target.value)}><option>개</option><option>팩</option><option>병</option><option>봉</option><option>g</option><option>kg</option><option>모</option></select></label><label className="full"><span>보관 위치 *</span><select value={spaceId} onChange={(event) => setSpaceId(event.target.value)}>{spaces.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label><label><span>기한 종류</span><select value={deadlineType} onChange={(event) => setDeadlineType(event.target.value as 'use_by' | 'expiration')}><option value="use_by">소비기한</option><option value="expiration">유통기한</option></select></label><label><span>{deadlineType === 'use_by' ? '소비기한 날짜' : '유통기한 날짜'}</span><input type="date" value={deadlineDate} onChange={(event) => setDeadlineDate(event.target.value)} /></label><label className="full"><span>메모</span><textarea value={memo} onChange={(event) => setMemo(event.target.value)} /></label></div><div className="detail-edit-actions"><button type="button" onClick={() => setEditing(false)}>취소</button><button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Check />} 수정 저장</button></div></form>}
  </section></div>
}

function MoveItemSheet({ item, spaces, onClose, onMove }: { item: InventoryItem; spaces: StorageSpace[]; onClose: () => void; onMove: (spaceId: string) => Promise<void> }) {
  const [targetId, setTargetId] = useState(item.storage_space_id)
  const [busy, setBusy] = useState(false)
  return <div className="sheet-backdrop"><section className="simple-sheet"><div className="sheet-head"><div><p>{item.product_name}</p><h2>보관 위치 이동</h2></div><button onClick={onClose}><X /></button></div><label><span>이동할 공간</span><select value={targetId} onChange={(event) => setTargetId(event.target.value)}>{spaces.map((space) => <option value={space.id} key={space.id}>{space.name}</option>)}</select></label><button className="primary-button" disabled={busy || targetId === item.storage_space_id} onClick={async () => { setBusy(true); try { await onMove(targetId) } finally { setBusy(false) } }}>{busy ? <LoaderCircle className="spin" /> : <Check />} 이동하기</button></section></div>
}

function ConsumptionScreen({ data, demoMode, onChanged }: { data: AppData; demoMode: boolean; onChanged: () => Promise<void> }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const visible = data.items.filter((item) => `${item.product_name} ${item.alias || ''} ${item.storage_spaces?.name || ''}`.toLowerCase().includes(query.toLowerCase()))
  const selectedEntries = data.items.filter((item) => selected[item.id] > 0).map((item) => ({ item, amount: selected[item.id] }))

  const changeAmount = (item: InventoryItem, direction: 1 | -1) => {
    const step = item.unit === 'g' ? 100 : item.unit === 'kg' ? 0.1 : 1
    setSelected((current) => {
      const next = Math.max(0, Math.min(Number(item.quantity), Number(((current[item.id] || 0) + step * direction).toFixed(2))))
      if (next === 0) { const copy = { ...current }; delete copy[item.id]; return copy }
      return { ...current, [item.id]: next }
    })
  }

  const submit = async () => {
    if (!selectedEntries.length) return
    if (demoMode) return alert('미리보기에서는 실제 소비가 저장되지 않아요.')
    const summary = selectedEntries.map(({ item, amount }) => `${item.product_name} ${amount}${item.unit}`).join(', ')
    if (!window.confirm(`${summary}\n먹은 것으로 기록할까요?`)) return
    setBusy(true)
    try { await consumeInventoryItems(selectedEntries); setSelected({}); await onChanged() }
    catch (error) { alert(error instanceof Error ? error.message : '소비 기록을 저장하지 못했습니다.') }
    finally { setBusy(false) }
  }

  return <><div className="page-heading"><div><p>먹은 만큼 한 번에 빼기</p><h1>식사 기록</h1></div><span className="meal-selected-count">{selectedEntries.length}종 선택</span></div><section className="meal-guide"><UtensilsCrossed /><div><b>방금 무엇을 먹었나요?</b><p>상품을 누르면 기본 1개가 선택돼요. 여러 상품도 한 번에 기록할 수 있어요.</p></div></section><label className="global-search meal-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="먹은 식재료 검색" />{query && <button onClick={() => setQuery('')}><X /></button>}</label><div className="meal-item-list">{visible.length ? visible.map((item) => { const amount = selected[item.id] || 0; return <article className={amount ? 'selected' : ''} key={item.id} onClick={() => !amount && changeAmount(item, 1)}><ItemThumb item={item} /><div><b>{item.product_name}</b><span>{item.storage_spaces?.name} · 보유 {item.quantity}{item.unit}</span></div>{amount ? <div className="meal-stepper"><button aria-label={`${item.product_name} 소비량 줄이기`} onClick={(event) => { event.stopPropagation(); changeAmount(item, -1) }}>−</button><strong>{amount}{item.unit}</strong><button aria-label={`${item.product_name} 소비량 늘리기`} disabled={amount >= Number(item.quantity)} onClick={(event) => { event.stopPropagation(); changeAmount(item, 1) }}>+</button></div> : <button className="meal-add" onClick={(event) => { event.stopPropagation(); changeAmount(item, 1) }}><Plus /> 먹었어요</button>}</article> }) : <div className="no-results"><Search /><p>해당하는 식재료가 없어요.</p></div>}</div>{selectedEntries.length > 0 && <div className="meal-submit-bar"><div><b>{selectedEntries.length}가지</b><span>{selectedEntries.map(({ item, amount }) => `${item.product_name} ${amount}${item.unit}`).join(' · ')}</span></div><button disabled={busy} onClick={() => void submit()}>{busy ? <LoaderCircle className="spin" /> : <UtensilsCrossed />} 소비 등록</button></div>}</>
}

function RecipeScreen({ data, profileId, demoMode, onChanged }: { data: AppData; profileId: string; demoMode: boolean; onChanged: () => Promise<void> }) {
  const [selected, setSelected] = useState<Recipe | null>(null)
  const [savedOnly, setSavedOnly] = useState(false)
  const [exploring, setExploring] = useState(false)
  const [query, setQuery] = useState('')
  const recommended = getRecommendedRecipes(data.recipes, data.items)
  const dailyRecipe = recommended[0]
  const baseRecipes = savedOnly ? data.recipes.filter((recipe) => data.savedRecipeIds.includes(recipe.id)) : recommended
  const searchedRecipes = baseRecipes.filter((recipe) => `${recipe.title} ${recipe.summary || ''} ${(recipe.ingredients || []).map((ingredient) => ingredient.ingredient_name).join(' ')}`.toLowerCase().includes(query.toLowerCase()))
  const visibleRecipes = exploring || savedOnly ? searchedRecipes : searchedRecipes.slice(0, 4)
  const toggleSave = async (recipe: Recipe) => {
    if (demoMode) return alert('미리보기에서는 저장되지 않아요.')
    await toggleSavedRecipe(profileId, recipe.id, data.savedRecipeIds.includes(recipe.id)); await onChanged()
  }
  if (!data.recipes.length) return <><div className="page-heading"><div><p>있는 재료부터 맛있게</p><h1>레시피</h1></div></div><div className="no-results"><BookOpen /><p>등록된 레시피가 없어요.</p></div></>
  return <>
    <div className="page-heading"><div><p>있는 재료부터 맛있게</p><h1>레시피</h1></div><button className={`icon-text ${savedOnly ? 'selected' : ''}`} onClick={() => setSavedOnly((current) => !current)}><BookOpen /> 저장됨 {data.savedRecipeIds.length}</button></div>
    {!exploring && !savedOnly && dailyRecipe && <article className="today-recipe"><div><span>오늘의 추천 레시피 · 매일 변경</span><h2>{dailyRecipe.title}</h2><p>{dailyRecipe.summary}</p><button onClick={() => setSelected(dailyRecipe)}>레시피 보기</button></div><div>🥘</div></article>}
    {(exploring || savedOnly) && <label className="global-search recipe-search"><Search /><input autoFocus={exploring} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="레시피 이름이나 재료로 검색" />{query && <button onClick={() => setQuery('')}><X /></button>}</label>}
    {!exploring && !savedOnly && dailyRecipe && <><SectionTitle title="재료 보유 현황" action="내 식재료 기준" /><div className="ingredient-summary"><div><b>{getRecipeMatch(dailyRecipe, data.items).have}</b><span>집에 있어요</span></div><div><b>{getRecipeMatch(dailyRecipe, data.items).urgent}</b><span>곧 상할 재료</span></div><div><b>{getRecipeMatch(dailyRecipe, data.items).missing}</b><span>추가로 필요</span></div></div></>}
    <SectionTitle title={savedOnly ? '저장한 레시피' : exploring ? '레시피 탐색' : '추천 레시피'} action={`${searchedRecipes.length}개`} />
    <div className="recipe-list">{visibleRecipes.length ? visibleRecipes.map((recipe) => { const match = getRecipeMatch(recipe, data.items); return <div className="recipe-list-row" key={recipe.id}><button onClick={() => setSelected(recipe)}><span>🍳</span><div><h3>{recipe.title}</h3><p>{recipe.summary}</p><small><Clock3 /> {recipe.cook_minutes || '-'}분 · 재료 {match.have}/{match.total}</small></div><ChevronRight /></button><button className={data.savedRecipeIds.includes(recipe.id) ? 'saved' : ''} aria-label={`${recipe.title} 저장`} onClick={() => void toggleSave(recipe)}><BookOpen /></button></div> }) : <div className="no-results"><BookOpen /><p>저장한 레시피가 없어요.</p></div>}</div>
    {!savedOnly && searchedRecipes.length > 4 && <button className="recipe-explore-button" onClick={() => { setExploring((current) => !current); setQuery('') }}>{exploring ? '추천만 보기' : `레시피 더보기 · ${searchedRecipes.length - 4}개`} <ChevronRight /></button>}
    {selected && <RecipeDetail recipe={selected} items={data.items} saved={data.savedRecipeIds.includes(selected.id)} onToggleSave={() => void toggleSave(selected)} onClose={() => setSelected(null)} />}
  </>
}

function AddItemSheet({ data, initialSpaceId, profileId, demoMode, onClose, onSaved }: { data: AppData; initialSpaceId: string | null; profileId: string; demoMode: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [mode, setMode] = useState<'barcode' | 'manual'>('barcode')
  const [busy, setBusy] = useState(false)
  const [barcode, setBarcode] = useState('')
  const [name, setName] = useState('')
  const [alias, setAlias] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('개')
  const [spaceId, setSpaceId] = useState(initialSpaceId || data.spaces[0]?.id || '')
  const [deadlineType, setDeadlineType] = useState<'use_by' | 'expiration'>('use_by')
  const [deadlineDate, setDeadlineDate] = useState('')
  const [memo, setMemo] = useState('')
  const [category, setCategory] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [barcodeImageUrl, setBarcodeImageUrl] = useState('')
  const [catalogProductId, setCatalogProductId] = useState<string | null>(null)
  const [needsSharedReview, setNeedsSharedReview] = useState(false)
  const quantityStep = unit === 'g' ? 100 : unit === 'kg' ? 0.1 : 1
  const changeQuantity = (direction: 1 | -1) => setQuantity((current) => String(Math.max(quantityStep, Number((Number(current) + quantityStep * direction).toFixed(2)))))
  const changeUnit = (nextUnit: string) => {
    if (nextUnit === 'g' && Number(quantity) === 1) setQuantity('100')
    else if (unit === 'g' && nextUnit !== 'g' && Number(quantity) === 100) setQuantity('1')
    setUnit(nextUnit)
  }

  const findBarcode = async (nextBarcode = barcode) => {
    if (!nextBarcode) return
    setBarcode(nextBarcode)
    setBusy(true)
    try { const found = await lookupBarcode(nextBarcode, profileId, data.kitchen.id); if (found) { setNeedsSharedReview(false); setCatalogProductId(found.catalogId); setName(found.name); setCategory(found.category); changeUnit(found.unit); setBarcodeImageUrl(found.imageUrl); setPreview(found.imageUrl) } else { setNeedsSharedReview(true); setCatalogProductId(null); alert('처음 등록하는 상품이에요. 입력한 상품명은 관리자 검토 후 공용 바코드 정보로 활용될 수 있어요.') } } finally { setBusy(false) }
  }
  const save = async () => {
    if (!name.trim() || !spaceId) return alert('상품명과 보관 위치는 필수입니다.')
    if (demoMode) { alert('등록 흐름을 확인했어요. 로그인 후에는 실제로 저장됩니다.'); await onSaved(); return }
    setBusy(true)
    try {
      const imagePath = file ? await uploadInventoryImage(file, data.kitchen.id, profileId) : barcodeImageUrl || null
      await createInventoryItem({ kitchen_id: data.kitchen.id, storage_space_id: spaceId, catalog_product_id: catalogProductId, created_by: profileId, product_name: name.trim(), alias: alias.trim() || null, barcode: barcode || null, image_path: imagePath, category: category || null, quantity: Number(quantity) || quantityStep, unit, purchased_at: new Date().toISOString().slice(0, 10), opened_at: null, expiration_date: deadlineType === 'expiration' ? deadlineDate || null : null, use_by_date: deadlineType === 'use_by' ? deadlineDate || null : null, recommended_use_date: null, memo: memo.trim() || null, registration_method: mode })
      if (needsSharedReview && barcode) {
        try { await submitBarcodeProduct({ barcode, productName: name.trim(), category, unit, imageUrl: getInventoryImageUrl(imagePath) }) }
        catch (submissionError) { console.warn('공용 바코드 검토 요청 실패:', submissionError) }
      }
      await onSaved()
    } catch (error) { alert(error instanceof Error ? error.message : '저장하지 못했습니다.') } finally { setBusy(false) }
  }
  return <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="add-sheet"><div className="sheet-handle" /><div className="sheet-head"><div><p>10초 안에 빠르게</p><h2>식재료 추가</h2></div><button onClick={onClose}><X /></button></div>
    <div className="mode-tabs"><button className={mode === 'barcode' ? 'active' : ''} onClick={() => setMode('barcode')}><ScanLine /> 바코드</button><button className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}><PenLine /> 직접 입력</button></div>
    {mode === 'barcode' && <><BarcodeCameraScanner onDetected={findBarcode} /><details className="barcode-manual"><summary>번호를 직접 입력할게요</summary><div><input inputMode="numeric" value={barcode} onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ''))} placeholder="880..." /><button onClick={() => void findBarcode()}>조회</button></div></details></>}
    <label className="photo-field">{preview ? <img src={preview} /> : <Camera />}<span>{file ? file.name : barcodeImageUrl ? '바코드 상품 사진을 함께 저장해요' : '상품 사진 촬영 또는 선택'}</span><input type="file" accept="image/*" capture="environment" onChange={(e) => { const selected = e.target.files?.[0] || null; setFile(selected); if (selected) { setBarcodeImageUrl(''); setPreview(URL.createObjectURL(selected)) } }} /></label>
    <div className="form-grid"><label className="full"><span>상품명 *</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 사과" /></label><label><span>별칭</span><input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="아침용" /></label><CategoryField value={category} onChange={setCategory} /><div className="quantity-field"><span>수량</span><div className="register-stepper"><button type="button" aria-label="수량 줄이기" onClick={() => changeQuantity(-1)}>−</button><strong>{quantity}</strong><button type="button" aria-label="수량 늘이기" onClick={() => changeQuantity(1)}>+</button></div></div><label><span>단위</span><select value={unit} onChange={(e) => changeUnit(e.target.value)}><option>개</option><option>팩</option><option>병</option><option>봉</option><option>g</option><option>kg</option><option>모</option></select></label><label className="full"><span>보관 위치 *</span><select value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>{data.spaces.map((space) => <option key={space.id} value={space.id}>{space.name}{space.alias ? ` · ${space.alias}` : ''}</option>)}</select></label><label><span>기한 종류</span><select value={deadlineType} onChange={(e) => setDeadlineType(e.target.value as 'use_by' | 'expiration')}><option value="use_by">소비기한</option><option value="expiration">유통기한</option></select></label><label><span>{deadlineType === 'use_by' ? '소비기한 날짜' : '유통기한 날짜'}</span><input type="date" value={deadlineDate} onChange={(e) => setDeadlineDate(e.target.value)} /></label><label className="full"><span>메모</span><textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="보관법이나 구입처를 적어두세요." /></label></div>
    <button className="primary-button" disabled={busy} onClick={save}>{busy ? <LoaderCircle className="spin" /> : <PackageCheck />} 저장하기</button>
  </section></div>
}

function BarcodeCameraScanner({ onDetected }: { onDetected: (barcode: string) => Promise<void> }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const detectedRef = useRef(false)
  const [scanning, setScanning] = useState(false)
  const [message, setMessage] = useState('카메라로 상품 바코드를 비춰 주세요.')

  const stop = () => {
    controlsRef.current?.stop()
    controlsRef.current = null
    setScanning(false)
  }

  useEffect(() => () => controlsRef.current?.stop(), [])

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return setMessage('이 브라우저에서는 카메라를 사용할 수 없어요. 아래에서 번호를 입력해 주세요.')
    stop()
    detectedRef.current = false
    setScanning(true)
    setMessage('바코드가 사각형 안에 크게 보이도록 비춰 주세요.')
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader = new BrowserMultiFormatReader()
      controlsRef.current = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
        videoRef.current || undefined,
        (result) => {
          if (!result || detectedRef.current) return
          const code = result.getText().trim()
          if (!/^\d{8,14}$/.test(code)) return
          detectedRef.current = true
          controlsRef.current?.stop()
          controlsRef.current = null
          setScanning(false)
          setMessage(`${code} 인식 완료 · 상품 정보를 찾고 있어요.`)
          if (navigator.vibrate) navigator.vibrate(80)
          void onDetected(code)
        },
      )
    } catch (error) {
      console.warn('바코드 카메라 시작 실패:', error)
      setScanning(false)
      setMessage('카메라 권한을 허용하지 못했어요. 권한을 확인하거나 번호를 직접 입력해 주세요.')
    }
  }

  return <section className={`barcode-camera ${scanning ? 'scanning' : ''}`}>
    <div className="camera-preview"><video ref={videoRef} muted playsInline /><div className="scan-frame"><span /></div></div>
    <p>{message}</p>
    {scanning ? <button type="button" onClick={stop}><X /> 스캔 취소</button> : <button type="button" onClick={() => void start()}><Camera /> 카메라로 자동 스캔</button>}
  </section>
}

function RecipeDetail({ recipe, items, saved, onToggleSave, onClose }: { recipe: Recipe; items: InventoryItem[]; saved: boolean; onToggleSave?: () => void; onClose: () => void }) {
  return <div className="sheet-backdrop"><section className="recipe-detail"><div className="sheet-head"><div><p>{recipe.cook_minutes}분 · {recipe.difficulty}</p><h2>{recipe.title}</h2></div><button onClick={onClose}><X /></button></div>{onToggleSave && <button className={`recipe-save-button ${saved ? 'saved' : ''}`} onClick={onToggleSave}><BookOpen /> {saved ? '저장됨' : '레시피 저장'}</button>}<p>{recipe.summary}</p><h3>재료</h3>{recipe.ingredients?.map((ingredient) => { const have = items.some((item) => itemMatchesIngredient(item, ingredient.ingredient_name)); return <div className={`recipe-ingredient ${have ? 'have' : ''}`} key={ingredient.ingredient_name}><span>{have ? <Check /> : <Plus />}</span><b>{ingredient.ingredient_name}</b><small>{ingredient.amount} · {have ? '집에 있어요' : '추가로 필요해요'}</small></div> })}<h3>만드는 법</h3><ol>{recipe.instructions.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol></section></div>
}

function ProfileScreen({ profile, kitchenName, kitchenId, demoMode, onExitDemo, onSignOut, onGoMap, onGoRecipes, onOpenNotifications, onChanged }: { profile: Profile | null; kitchenName: string; kitchenId: string; demoMode: boolean; onExitDemo: () => void; onSignOut: () => Promise<void>; onGoMap: () => void; onGoRecipes: () => void; onOpenNotifications: () => void; onChanged: () => Promise<void> }) {
  const nickname = profile?.nickname || '미리보기 사용자'
  const [editing, setEditing] = useState<'profile' | 'kitchen' | null>(null)
  const [adminOpen, setAdminOpen] = useState(false)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const openEdit = (target: 'profile' | 'kitchen') => { setEditing(target); setValue(target === 'profile' ? nickname : kitchenName) }
  const save = async () => {
    const clean = value.trim()
    if (!clean || demoMode || !profile) return
    setBusy(true)
    try {
      if (editing === 'profile') await updateProfileNickname(profile.id, clean)
      else await updateKitchenName(kitchenId, clean)
      setEditing(null)
      await onChanged()
    } catch (error) { alert(error instanceof Error ? error.message : '저장하지 못했습니다.') }
    finally { setBusy(false) }
  }
  return <>
    <div className="page-heading"><div><p>반가워요</p><h1>{nickname}</h1></div></div>
    <div className="profile-card"><CircleUserRound /><div><b>{nickname}</b><span>{demoMode ? '미리보기 모드' : profile?.username ? `@${profile.username} · 아이디 계정` : '로그인 계정'}</span></div>{!demoMode && <button onClick={() => openEdit('profile')}><PenLine /></button>}</div>
    <section className="profile-kitchen"><div><span>내 주방</span><b>{kitchenName}</b></div>{!demoMode && <button onClick={() => openEdit('kitchen')}><PenLine /> 이름 수정</button>}</section>
    <div className="settings-list"><button onClick={onOpenNotifications}><Bell /><span><b>알림 내역</b><small>소비기한 알림을 확인합니다</small></span><ChevronRight /></button><button onClick={onGoMap}><Map /><span><b>내 주방 관리</b><small>보관공간 이름과 배치를 관리합니다</small></span><ChevronRight /></button><button onClick={onGoRecipes}><BookOpen /><span><b>내 레시피북</b><small>저장한 레시피를 보고 새로운 요리를 탐색합니다</small></span><ChevronRight /></button>{profile?.is_admin && !demoMode && <button className="admin-setting" onClick={() => setAdminOpen(true)}><ShieldCheck /><span><b>공용 바코드 관리</b><small>사용자가 등록한 상품을 검토하고 승인합니다</small></span><ChevronRight /></button>}</div>
    <button className="signout" onClick={demoMode ? onExitDemo : onSignOut}><LogOut /> {demoMode ? '로그인 화면으로' : '로그아웃'}</button>
    {editing && <div className="sheet-backdrop"><section className="simple-sheet"><div className="sheet-head"><div><p>{editing === 'profile' ? '마이페이지에 표시됩니다' : '홈 화면에 표시됩니다'}</p><h2>{editing === 'profile' ? '이름 수정' : '주방 이름 수정'}</h2></div><button onClick={() => setEditing(null)}><X /></button></div><label><span>{editing === 'profile' ? '표시 이름' : '주방 이름'}</span><input autoFocus maxLength={30} value={value} onChange={(event) => setValue(event.target.value)} /></label><button className="primary-button" disabled={busy || !value.trim()} onClick={() => void save()}>{busy ? <LoaderCircle className="spin" /> : <Check />} 저장하기</button></section></div>}
    {adminOpen && <BarcodeAdminSheet onClose={() => setAdminOpen(false)} />}
  </>
}

function BarcodeAdminSheet({ onClose }: { onClose: () => void }) {
  const [submissions, setSubmissions] = useState<BarcodeProductSubmission[]>([])
  const [selected, setSelected] = useState<BarcodeProductSubmission | null>(null)
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [category, setCategory] = useState('')
  const [unit, setUnit] = useState('개')
  const [imageUrl, setImageUrl] = useState('')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const load = async () => {
    setBusy(true); setError('')
    try { setSubmissions(await loadBarcodeProductSubmissions()) }
    catch (nextError) { setError((nextError as { message?: string }).message || '검토 목록을 불러오지 못했습니다.') }
    finally { setBusy(false) }
  }
  useEffect(() => { void load() }, [])
  const open = (submission: BarcodeProductSubmission) => {
    setSelected(submission); setName(submission.product_name); setBrand(submission.brand || ''); setCategory(submission.category || ''); setUnit(submission.default_unit || '개'); setImageUrl(submission.image_url || ''); setError('')
  }
  const approve = async () => {
    if (!selected || !name.trim()) return
    setBusy(true); setError('')
    try { const result = await approveBarcodeProduct(selected.id, selected.barcode, { productName: name.trim(), brand: brand.trim(), category: category.trim(), unit, imageUrl: imageUrl.trim() }); setSelected(null); await load(); if (result.imageWarning) setError(`상품은 승인했지만 사진은 저장하지 못했어요: ${result.imageWarning}`) }
    catch (nextError) { setError((nextError as { message?: string }).message || '상품을 승인하지 못했습니다.'); setBusy(false) }
  }
  const reject = async () => {
    if (!selected || !window.confirm('이 검토 요청을 삭제할까요? 사용자의 개인 상품은 삭제되지 않습니다.')) return
    setBusy(true); setError('')
    try { await rejectBarcodeProduct(selected.id); setSelected(null); await load() }
    catch (nextError) { setError((nextError as { message?: string }).message || '검토 요청을 삭제하지 못했습니다.'); setBusy(false) }
  }
  return <div className="sheet-backdrop"><section className="barcode-admin-sheet"><div className="sheet-head"><div><p>관리자 전용 · {submissions.length}건 대기</p><h2>공용 바코드 관리</h2></div><button onClick={onClose}><X /></button></div>
    {error && <p className="form-error">{error}</p>}
    {busy && !selected ? <div className="admin-loading"><LoaderCircle className="spin" /> 불러오는 중</div> : selected ? <><button className="admin-back" onClick={() => setSelected(null)}>← 목록으로</button><div className="admin-product-preview">{imageUrl ? <img src={imageUrl} alt="" /> : <Package />}<div><b>{selected.barcode}</b><span>{new Date(selected.created_at).toLocaleString('ko-KR')}</span></div></div><div className="form-grid"><label className="full"><span>공용 상품명 *</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>브랜드/제조사</span><input value={brand} onChange={(event) => setBrand(event.target.value)} /></label><CategoryField value={category} onChange={setCategory} /><label><span>기본 단위</span><select value={unit} onChange={(event) => setUnit(event.target.value)}><option>개</option><option>팩</option><option>병</option><option>봉</option><option>g</option><option>kg</option><option>모</option></select></label><label className="full"><span>상품 이미지 URL</span><input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} /></label></div><div className="admin-review-actions"><button disabled={busy} onClick={() => void reject()}><Trash2 /> 삭제</button><button disabled={busy || !name.trim()} onClick={() => void approve()}>{busy ? <LoaderCircle className="spin" /> : <ShieldCheck />} 수정 내용으로 승인</button></div></> : submissions.length ? <div className="admin-submission-list">{submissions.map((submission) => <button onClick={() => open(submission)} key={submission.id}>{submission.image_url ? <img src={submission.image_url} alt="" /> : <Package />}<span><b>{submission.product_name}</b><small>{submission.barcode} · {submission.category || '분류 없음'}</small></span><ChevronRight /></button>)}</div> : <div className="no-results"><ShieldCheck /><p>검토할 신규 상품이 없습니다.</p></div>}
  </section></div>
}

function NotificationsSheet({ notifications, profileId, demoMode, onClose, onRead }: { notifications: AppNotification[]; profileId: string; demoMode: boolean; onClose: () => void; onRead: () => Promise<void> }) {
  const readAll = async () => {
    if (demoMode || !profileId) return
    await markNotificationsRead(profileId); await onRead()
  }
  return <div className="sheet-backdrop"><section className="simple-sheet notifications-sheet"><div className="sheet-head"><div><p>최근 30개</p><h2>알림</h2></div><button onClick={onClose}><X /></button></div>{notifications.some((item) => !item.is_read) && <button className="read-all" onClick={() => void readAll()}><Check /> 모두 읽음</button>}<div className="notification-list">{notifications.length ? notifications.map((notification) => <article className={notification.is_read ? '' : 'unread'} key={notification.id}><Bell /><div><b>{notification.title}</b><p>{notification.message}</p><small>{new Date(notification.created_at).toLocaleString('ko-KR')}</small></div></article>) : <div className="no-results"><Bell /><p>도착한 알림이 없어요.</p></div>}</div></section></div>
}

function BottomNav({ tab, setTab, onAdd }: { tab: Tab; setTab: (tab: Tab) => void; onAdd: () => void }) {
  const links: { id: Tab; label: string; icon: React.ReactNode }[] = [{ id: 'home', label: '홈', icon: <Home /> }, { id: 'map', label: '주방맵', icon: <Map /> }, { id: 'search', label: '검색', icon: <Search /> }, { id: 'consume', label: '식사', icon: <UtensilsCrossed /> }]
  return <nav className="bottom-nav">{links.slice(0, 2).map((link) => <button className={tab === link.id ? 'active' : ''} onClick={() => setTab(link.id)} key={link.id}>{link.icon}<span>{link.label}</span></button>)}<button className="add-button" onClick={onAdd} aria-label="식재료 추가"><Plus /></button>{links.slice(2).map((link) => <button className={tab === link.id ? 'active' : ''} onClick={() => setTab(link.id)} key={link.id}>{link.icon}<span>{link.label}</span></button>)}</nav>
}

function SectionTitle({ title, action }: { title: string; action: string }) { return <div className="section-title"><h2>{title}</h2><span>{action}</span></div> }
function MapPageTabs({ maps, activeMapId, onSelect, onAdd }: { maps: KitchenMapPage[]; activeMapId: string; onSelect: (mapId: string) => void; onAdd?: () => void }) {
  return <div className="map-page-tabs" role="tablist" aria-label="주방맵 선택">{maps.map((map, index) => <button role="tab" aria-selected={map.id === activeMapId} className={map.id === activeMapId ? 'active' : ''} onClick={() => onSelect(map.id)} key={map.id}><span>{index + 1}</span>{map.name}</button>)}{onAdd && <button className="add" onClick={onAdd}><Plus /> 맵 추가</button>}</div>
}
function CategoryField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const isPreset = categoryOptions.includes(value)
  const [customMode, setCustomMode] = useState(Boolean(value && !isPreset))
  useEffect(() => {
    if (value) setCustomMode(!categoryOptions.includes(value))
  }, [value])
  const selectValue = customMode ? '__custom' : isPreset ? value : ''
  return <div className="category-field"><label><span>카테고리</span><select value={selectValue} onChange={(event) => { const next = event.target.value; setCustomMode(next === '__custom'); onChange(next === '__custom' ? '' : next) }}><option value="">선택하세요</option>{categoryOptions.map((category) => <option value={category} key={category}>{category}</option>)}<option value="__custom">직접 입력</option></select></label>{customMode && <input autoFocus aria-label="카테고리 직접 입력" value={value} onChange={(event) => onChange(event.target.value)} placeholder="예: 건강식품" />}</div>
}
function ItemMiniCard({ item, onClick }: { item: InventoryItem; onClick: () => void }) { const days = getDaysLeft(item); return <button className="item-mini" onClick={onClick}><ItemThumb item={item} /><b>{item.product_name}</b><span>{item.storage_spaces?.name}</span><em className={days <= 0 ? 'danger' : ''}>{days < 0 ? `${Math.abs(days)}일 지남` : days === 0 ? '오늘' : `${days}일`}</em></button> }
function ItemThumb({ item }: { item: InventoryItem }) { const url = getInventoryImageUrl(item.image_path); const visual = getItemCategoryVisual(item); return <div className={`item-thumb category-${visual.key}`}>{url ? <img src={url} /> : visual.icon}</div> }
function ItemRow({ item, onClick }: { item: InventoryItem; onClick: () => void }) { return <button className="drawer-item" onClick={onClick}><ItemThumb item={item} /><div><b>{item.product_name}</b><span>{item.quantity}{item.unit} · {dateLabel(item)}</span></div><ChevronRight /></button> }
function EmptyMini() { return <div className="empty-mini"><Check /> 일주일 안에 서둘러 먹을 식재료가 없어요.</div> }
function FullLoader({ compact = false }: { compact?: boolean }) { return <div className={`full-loader ${compact ? 'compact' : ''}`}><LoaderCircle className="spin" /><span>주방을 정리하고 있어요</span></div> }
function dateLabel(item: InventoryItem) { const days = getDaysLeft(item); if (!Number.isFinite(days)) return '기한 미설정'; if (days < 0) return `${Math.abs(days)}일 지남`; if (days === 0) return '오늘까지'; return `${days}일 남음` }
function normalize(value: string) { return value.replace(/\s/g, '').toLowerCase() }
function getItemCategoryVisual(item: Pick<InventoryItem, 'category' | 'product_name'>): { key: string; icon: React.ReactNode } {
  const value = normalize(`${item.category || ''} ${item.product_name}`)
  if (/채소|야채|나물|버섯|콩나물|시금치|오이|양파|당근|감자|고추/.test(value)) return { key: 'vegetable', icon: <Carrot /> }
  if (/과일|사과|바나나|딸기|포도|귤|오렌지|토마토/.test(value)) return { key: 'fruit', icon: <Apple /> }
  if (/육류|고기|돼지|소|닭|햄|소시지/.test(value)) return { key: 'meat', icon: <Beef /> }
  if (/수산|생선|해물|오징어|새우|조개|참치|멸치|어묵/.test(value)) return { key: 'seafood', icon: <Fish /> }
  if (/달걀|계란/.test(value)) return { key: 'egg', icon: <Egg /> }
  if (/유제품|우유|치즈|요거트|버터/.test(value)) return { key: 'dairy', icon: <Milk /> }
  if (/곡류|면|쌀|밥|국수|라면|떡|식빵|빵/.test(value)) return { key: 'grain', icon: <Wheat /> }
  if (/음료|주스|탄산|커피|차|물/.test(value)) return { key: 'drink', icon: <CupSoda /> }
  if (/조미료|소스|간장|고추장|된장|식초|참기름|소금|설탕/.test(value)) return { key: 'sauce', icon: <CookingPot /> }
  if (/간식|과자|초콜릿|캔디/.test(value)) return { key: 'snack', icon: <Cookie /> }
  if (/냉동/.test(value)) return { key: 'frozen', icon: <Snowflake /> }
  return { key: 'other', icon: <Package /> }
}
function normalizeIngredient(value: string) {
  return normalize(value)
    .replaceAll('달걀', '계란')
}
function itemMatchesIngredient(item: InventoryItem, ingredientName: string) {
  const ingredient = normalizeIngredient(ingredientName)
  return [item.product_name, item.category].filter(Boolean).some((value) => {
    const candidate = normalizeIngredient(value as string)
    return candidate.includes(ingredient) || ingredient.includes(candidate)
  })
}
function getRecipeMatch(recipe: Recipe | undefined, items: InventoryItem[]) { const ingredients = recipe?.ingredients || []; const matches = ingredients.map((ingredient) => items.find((item) => itemMatchesIngredient(item, ingredient.ingredient_name))); return { total: ingredients.length, have: matches.filter(Boolean).length, urgent: matches.filter((item) => item && getDaysLeft(item) <= 3).length, missing: matches.filter((item) => !item).length } }
function getRecommendedRecipes(recipes: Recipe[], items: InventoryItem[]) {
  const daySeed = Math.floor(Date.now() / 86400000)
  return [...recipes].sort((a, b) => {
    const left = getRecipeMatch(a, items)
    const right = getRecipeMatch(b, items)
    const hasIngredientPriority = Number(right.have > 0) - Number(left.have > 0)
    return hasIngredientPriority
      || dailyRecipeRank(b.id, daySeed, right) - dailyRecipeRank(a.id, daySeed, left)
  })
}

function dailyRecipeRank(recipeId: string, daySeed: number, match: ReturnType<typeof getRecipeMatch>) {
  let hash = daySeed ^ 2166136261
  for (const character of recipeId) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  const random = (hash >>> 0) / 4294967295
  const matchRatio = match.total ? match.have / match.total : 0
  return random * .75 + matchRatio * .15 + Math.min(match.urgent, 2) * .05
}

export default App
