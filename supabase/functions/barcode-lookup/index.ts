const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type FoodSafetyRow = Record<string, string | undefined>

async function fetchFoodSafety(service: string, key: string, filter: string) {
  const url = `https://openapi.foodsafetykorea.go.kr/api/${encodeURIComponent(key)}/${service}/json/1/5/${filter}`
  const response = await fetch(url, { signal: AbortSignal.timeout(7000) })
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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { barcode } = await request.json()
    if (!/^\d{8,14}$/.test(String(barcode || ''))) return Response.json({ found: false, reason: 'invalid_barcode' }, { status: 400, headers: corsHeaders })

    const apiKey = Deno.env.get('FOOD_SAFETY_KOREA_API_KEY')
    if (!apiKey) return Response.json({ found: false, reason: 'api_key_not_configured' }, { status: 503, headers: corsHeaders })

    const distributionRows = await fetchFoodSafety('I2570', apiKey, `BRCD_NO=${encodeURIComponent(barcode)}`)
    const distributionProduct = distributionRows.find((row) => String(row.BRCD_NO || '').replace(/\D/g, '') === barcode) || distributionRows[0]
    const linkedRows = distributionProduct ? [] : await fetchFoodSafety('C005', apiKey, `BAR_CD=${encodeURIComponent(barcode)}`)
    const linkedProduct = linkedRows.find((row) => String(row.BAR_CD || '').replace(/\D/g, '') === barcode) || linkedRows[0]
    const barcodeProduct = distributionProduct || linkedProduct
    if (!barcodeProduct) return Response.json({ found: false }, { headers: corsHeaders })

    const reportNo = barcodeProduct.PRDLST_REPORT_NO || ''
    const productRows = reportNo ? await fetchFoodSafety('C002', apiKey, `PRDLST_REPORT_NO=${encodeURIComponent(reportNo)}`) : []
    const product = productRows.find((row) => row.PRDLST_REPORT_NO === reportNo) || productRows[0]
    const publicDataKey = Deno.env.get('DATA_GO_KR_API_KEY')
    const haccp = reportNo && publicDataKey ? await fetchHaccpProduct(publicDataKey, reportNo).catch(() => null) : null
    const name = product?.PRDLST_NM || barcodeProduct.PRDT_NM || barcodeProduct.PRDLST_NM || haccp?.prdlstNm || ''
    if (!name.trim()) return Response.json({ found: false, reason: 'missing_product_name' }, { headers: corsHeaders })

    return Response.json({
      found: true,
      name,
      brand: product?.BSSH_NM || barcodeProduct.CMPNY_NM || barcodeProduct.BSSH_NM || haccp?.manufacture || '',
      category: product?.PRDLST_DCNM || barcodeProduct.PRDLST_DCNM || barcodeProduct.PRDLST_NM || barcodeProduct.HRNK_PRDLST_NM || haccp?.prdkind || '',
      imageUrl: haccp?.productImg || haccp?.imgurl || haccp?.imgUrl || '',
      reportNo,
      source: distributionProduct ? 'foodsafety_i2570' : 'foodsafety_c005',
    }, { headers: { ...corsHeaders, 'Cache-Control': 'public, max-age=86400' } })
  } catch (error) {
    console.error('barcode-lookup failed', error)
    return Response.json({ found: false, reason: 'lookup_failed' }, { status: 502, headers: corsHeaders })
  }
})
