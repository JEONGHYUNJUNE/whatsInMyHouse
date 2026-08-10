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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { barcode } = await request.json()
    if (!/^\d{8,14}$/.test(String(barcode || ''))) return Response.json({ found: false, reason: 'invalid_barcode' }, { status: 400, headers: corsHeaders })

    const apiKey = Deno.env.get('FOOD_SAFETY_KOREA_API_KEY')
    if (!apiKey) return Response.json({ found: false, reason: 'api_key_not_configured' }, { status: 503, headers: corsHeaders })

    const barcodeRows = await fetchFoodSafety('I2570', apiKey, `BRCD_NO=${encodeURIComponent(barcode)}`)
    const barcodeProduct = barcodeRows.find((row) => String(row.BRCD_NO || '').replace(/\D/g, '') === barcode) || barcodeRows[0]
    if (!barcodeProduct) return Response.json({ found: false }, { headers: corsHeaders })

    const reportNo = barcodeProduct.PRDLST_REPORT_NO || ''
    const productRows = reportNo ? await fetchFoodSafety('C002', apiKey, `PRDLST_REPORT_NO=${encodeURIComponent(reportNo)}`) : []
    const product = productRows.find((row) => row.PRDLST_REPORT_NO === reportNo) || productRows[0]

    return Response.json({
      found: true,
      name: product?.PRDLST_NM || barcodeProduct.PRDT_NM || '',
      brand: product?.BSSH_NM || barcodeProduct.CMPNY_NM || '',
      category: product?.PRDLST_DCNM || barcodeProduct.PRDLST_NM || barcodeProduct.HRNK_PRDLST_NM || '',
      reportNo,
      source: 'foodsafety_korea',
    }, { headers: { ...corsHeaders, 'Cache-Control': 'public, max-age=86400' } })
  } catch (error) {
    console.error('barcode-lookup failed', error)
    return Response.json({ found: false, reason: 'lookup_failed' }, { status: 502, headers: corsHeaders })
  }
})
