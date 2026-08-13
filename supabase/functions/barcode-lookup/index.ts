const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type FoodSafetyRow = Record<string, string | undefined>

async function fetchFoodSafety(service: string, key: string, filter: string) {
  const url = `https://openapi.foodsafetykorea.go.kr/api/${encodeURIComponent(key)}/${service}/json/1/5/${filter}`
  const response = await fetch(url, { signal: AbortSignal.timeout(4000) })
  if (!response.ok) return [] as FoodSafetyRow[]
  const json = await response.json()
  return (json?.[service]?.row || []) as FoodSafetyRow[]
}

async function fetchHaccpProduct(serviceKey: string, reportNo: string) {
  const url = new URL('https://apis.data.go.kr/B553748/CertImgListServiceV3/getCertImgListServiceV3')
  url.searchParams.set('ServiceKey', serviceKey)
  url.searchParams.set('prdlstReportNo', reportNo)
  url.searchParams.set('returnType', 'json')
  url.searchParams.set('pageNo', '1')
  url.searchParams.set('numOfRows', '5')
  const response = await fetch(url, { signal: AbortSignal.timeout(7000) })
  if (!response.ok) return null
  const json = await response.json()
  const items = json?.response?.body?.items?.item || json?.body?.items?.item || []
  return (Array.isArray(items) ? items[0] : items) as FoodSafetyRow | null
}

async function fetchOpenFoodFactsImage(barcode: string) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}?fields=image_front_small_url,image_front_url,image_url`
  const response = await fetch(url, {
    headers: { 'User-Agent': 'WhatsInMyHouse/1.0 (barcode image lookup)' },
    signal: AbortSignal.timeout(7000),
  })
  if (!response.ok) return ''
  const json = await response.json()
  const product = json?.product
  return product?.image_front_small_url || product?.image_front_url || product?.image_url || ''
}

function plainText(value: unknown) {
  return String(value || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
}

async function fetchNaverWebCandidates(barcode: string) {
  const clientId = Deno.env.get('NAVER_API_HUB_CLIENT_ID')
  const clientSecret = Deno.env.get('NAVER_API_HUB_CLIENT_SECRET')
  if (!clientId || !clientSecret) return []
  const url = new URL('https://naverapihub.apigw.ntruss.com/search/v1/webkr')
  url.searchParams.set('query', `"${barcode}"`)
  url.searchParams.set('display', '10')
  url.searchParams.set('start', '1')
  url.searchParams.set('format', 'json')
  const response = await fetch(url, { headers: { 'X-NCP-APIGW-API-KEY-ID': clientId, 'X-NCP-APIGW-API-KEY': clientSecret }, signal: AbortSignal.timeout(5000) })
  if (!response.ok) return []
  const json = await response.json()
  return (Array.isArray(json?.items) ? json.items : [])
    .map((item: Record<string, unknown>) => ({ name: plainText(item.title).replaceAll(barcode, '').replace(/^\s*[-|:·]\s*|\s*[-|:·]\s*$/g, '').trim(), description: plainText(item.description), url: String(item.link || '') }))
    // NAVER uses the barcode as the search query but usually does not repeat the
    // numeric code in the returned title/description. These are suggestions only:
    // the app always asks the user to confirm a candidate before filling the name.
    .filter((item: { name: string; url: string }) => item.name.length >= 2 && item.url.startsWith('http'))
    .filter((item: { name: string }, index: number, items: { name: string }[]) => items.findIndex((candidate) => candidate.name === item.name) === index)
    .slice(0, 3)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { barcode, webFallback = false } = await request.json()
    if (!/^\d{8,14}$/.test(String(barcode || ''))) return Response.json({ found: false, reason: 'invalid_barcode' }, { status: 400, headers: corsHeaders })

    const apiKey = Deno.env.get('FOOD_SAFETY_KOREA_API_KEY')
    if (!apiKey) return Response.json({ found: false, reason: 'api_key_not_configured' }, { status: 503, headers: corsHeaders })

    const [distributionRows, linkedRows] = await Promise.all([
      fetchFoodSafety('I2570', apiKey, `BRCD_NO=${encodeURIComponent(barcode)}`).catch(() => []),
      fetchFoodSafety('C005', apiKey, `BAR_CD=${encodeURIComponent(barcode)}`).catch(() => []),
    ])
    const distributionProduct = distributionRows.find((row) => String(row.BRCD_NO || '').replace(/\D/g, '') === barcode)
    const linkedProduct = linkedRows.find((row) => String(row.BAR_CD || '').replace(/\D/g, '') === barcode)
    const barcodeProduct = distributionProduct || linkedProduct
    if (!barcodeProduct) {
      const candidates = webFallback ? await fetchNaverWebCandidates(String(barcode)).catch(() => []) : []
      return Response.json({ found: false, candidates, source: candidates.length ? 'naver_web_search' : undefined }, { headers: corsHeaders })
    }

    const reportNo = barcodeProduct.PRDLST_REPORT_NO || ''
    const productRows = reportNo ? await fetchFoodSafety('C002', apiKey, `PRDLST_REPORT_NO=${encodeURIComponent(reportNo)}`) : []
    const product = productRows.find((row) => row.PRDLST_REPORT_NO === reportNo) || productRows[0]
    const publicDataKey = Deno.env.get('DATA_GO_KR_API_KEY')
    const haccp = reportNo && publicDataKey ? await fetchHaccpProduct(publicDataKey, reportNo).catch(() => null) : null
    const name = product?.PRDLST_NM || barcodeProduct.PRDT_NM || barcodeProduct.PRDLST_NM || haccp?.prdlstNm || ''
    if (!name.trim()) return Response.json({ found: false, reason: 'missing_product_name' }, { headers: corsHeaders })
    const domesticImageUrl = haccp?.productImg || haccp?.imgurl || haccp?.imgUrl || ''
    const imageUrl = domesticImageUrl || await fetchOpenFoodFactsImage(barcode).catch(() => '')

    return Response.json({
      found: true,
      name,
      brand: product?.BSSH_NM || barcodeProduct.CMPNY_NM || barcodeProduct.BSSH_NM || haccp?.manufacture || '',
      category: product?.PRDLST_DCNM || barcodeProduct.PRDLST_DCNM || barcodeProduct.PRDLST_NM || barcodeProduct.HRNK_PRDLST_NM || haccp?.prdkind || '',
      imageUrl,
      reportNo,
      source: distributionProduct ? 'foodsafety_i2570' : 'foodsafety_c005',
    }, { headers: { ...corsHeaders, 'Cache-Control': 'public, max-age=86400' } })
  } catch (error) {
    console.error('barcode-lookup failed', error)
    return Response.json({ found: false, reason: 'lookup_failed' }, { status: 502, headers: corsHeaders })
  }
})
