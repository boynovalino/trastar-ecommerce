/* TRASTAR development storefront bridge. Preview orders are unpaid and use synthetic identities. */
(function(){
'use strict';
const MOCK_EMAIL='qa-fixture@example.invalid';
const MOCK_RECIPIENT='TRASTAR QA FIXTURE';
let catalogReady=false;

function previewPrice(product,qty){
  const tiers=product.priceTiers||[];
  return tiers.reduce((price,t)=>qty>=t.minQty?t.unitPriceIdr:price,product.salePrice);
}
function responseError(data,status){
  return new Error((data.error||'HTTP_'+status)+': '+(data.message||'Request failed'));
}
async function api(path,payload,extraHeaders){
  const opt=payload===undefined?{method:'GET'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)};
  if(extraHeaders)opt.headers={...(opt.headers||{}),...extraHeaders};
  const res=await fetch(path,opt);
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw responseError(data,res.status);
  return data;
}
function shippingCart(items){
  return items.map(it=>({variantId:it.product.variantId,quantity:it.qty}));
}
function ConnectedCartPage(){
  const {items,updateQty,removeItem,clearCart}=useAppState();
  const {navigate}=useRouter();
  const subtotal=items.reduce((sum,it)=>sum+previewPrice(it.product,it.qty)*it.qty,0);
  return h('div',{className:'max-w-5xl mx-auto px-4 py-8'},
    h(Breadcrumb,{items:[{label:'Home',to:'/'},{label:'Shopping Cart'}]}),
    h('h1',{className:'font-display font-extrabold text-2xl mb-3'},'Keranjang TRASTAR'),
    h('p',{className:'text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-5'},
      'MODE QA: Produk dan harga berasal dari database Neon development. Belum ada pembayaran nyata.'),
    items.length===0?h('div',{className:'bg-white rounded-xl border p-10 text-center'},
      h('p',{className:'mb-4'},'Keranjang kosong.'),
      h(Link,{to:'/shop',className:'text-[var(--trs-red)] font-bold'},'Kembali ke katalog')):
    h('div',{className:'grid lg:grid-cols-[1fr_300px] gap-5'},
      h('div',{className:'bg-white rounded-xl border p-4 space-y-4'},
        items.map(it=>h('div',{key:it.product.variantId,className:'flex items-center gap-4 border-b pb-4'},
          h('div',{className:'w-16 h-16 rounded-lg overflow-hidden'},h(ProductThumb,{product:it.product})),
          h('div',{className:'flex-1 min-w-0'},
            h(Link,{to:'/product/'+it.product.slug,className:'font-semibold text-sm text-gray-800'},it.product.name),
            h('p',{className:'text-xs text-gray-500'},it.product.sku),
            h('p',{className:'font-bold text-sm'},formatIDR(previewPrice(it.product,it.qty))+'/unit'),
            h('p',{className:'text-xs text-gray-500'},'Total '+formatIDR(previewPrice(it.product,it.qty)*it.qty))
          ),
          h(QuantitySelector,{value:it.qty,onChange:q=>updateQty(it.index,Math.min(q,Math.min(999,it.product.stock)))}),
          h('button',{type:'button',onClick:()=>removeItem(it.index),'aria-label':'Hapus produk',className:'text-red-600'},h(Icon,{name:'x'}))
        )),
        h('button',{type:'button',className:'text-xs text-gray-500',onClick:clearCart},'Kosongkan keranjang')
      ),
      h('div',{className:'bg-white rounded-xl border p-5 h-fit'},
        h('h2',{className:'font-bold text-lg mb-3'},'Ringkasan produk'),
        h('p',{className:'flex justify-between text-sm mb-3'},h('span',null,'Subtotal'),h('strong',null,formatIDR(subtotal))),
        h('p',{className:'text-xs text-gray-500 mb-4'},'Ongkir disimulasikan melalui API saat checkout. Harga akhir dihitung ulang oleh backend.'),
        h('button',{type:'button',onClick:()=>navigate('/checkout'),className:'trs-btn-primary w-full py-3 rounded-lg font-bold'},'LANJUT CHECKOUT QA')
      )
    )
  );
}
function ConnectedCheckoutPage(){
  const {items,clearCart}=useAppState();
  const {navigate}=useRouter();
  const [country,setCountry]=useState('ID');
  const [quote,setQuote]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const subtotal=items.reduce((sum,it)=>sum+previewPrice(it.product,it.qty)*it.qty,0);
  function resetQuote(){setQuote(null);setError('');}
  async function getQuote(){
    if(!items.length)return;
    setBusy(true);setError('');setQuote(null);
    try{
      const result=await api('/api/quote',{country,items:shippingCart(items)});
      if(!result.quote?.isSimulation||!result.quote.quoteToken)throw new Error('Tidak menerima quote simulasi yang valid');
      setQuote(result.quote);
    }catch(e){setError(e.message);}
    finally{setBusy(false);}
  }
  async function createOrder(e){
    e.preventDefault();
    if(!quote||busy)return;
    setBusy(true);setError('');
    try{
      if(quote.country!==country)throw new Error('Negara tujuan berubah. Hitung ongkir ulang.');
      const data=await api('/api/orders',{
        items:shippingCart(items),quoteToken:quote.quoteToken,
        recipientName:MOCK_RECIPIENT,email:MOCK_EMAIL,
        address:{country,city:country==='ID'?'Jakarta QA':'Demo City',line1:'TEST ONLY 123 Example Road',postalCode:'000000'}
      });
      if(data.paymentStatus!=='PENDING'||!data.isSimulation||data.paymentAvailable!==false)throw new Error('Status order dari backend tidak sesuai mode QA.');
      sessionStorage.setItem('trastar_preview_order',JSON.stringify({orderNo:data.orderNo,accessToken:data.accessToken}));
      clearCart();
      navigate('/orders/'+data.orderNo);
    }catch(e){setError(e.message);}
    finally{setBusy(false);}
  }
  if(!items.length)return h('div',{className:'max-w-xl mx-auto p-10 text-center'},h('p',null,'Keranjang kosong.'),h(Link,{to:'/shop',className:'text-red-600'},'Belanja kembali'));
  return h('div',{className:'max-w-5xl mx-auto px-4 py-8'},
    h(Breadcrumb,{items:[{label:'Home',to:'/'},{label:'Cart',to:'/cart'},{label:'Checkout'}]}),
    h('h1',{className:'font-display text-2xl font-extrabold mb-4'},'Checkout TRASTAR (QA)'),
    h('p',{className:'bg-amber-50 text-amber-900 border border-amber-200 p-4 rounded-lg mb-5 text-sm'},
      'Hanya data fiktif. Nama dan email dikunci sebagai QA fixture. Tidak ada pembayaran/kurir yang aktif. Jangan isi alamat atau kontak sungguhan.'),
    h('form',{onSubmit:createOrder,className:'grid md:grid-cols-[1fr_320px] gap-5'},
      h('div',{className:'bg-white rounded-xl border p-5 space-y-4'},
        h('h2',{className:'font-bold'},'Alamat pengiriman simulasi'),
        h(Field,{label:'Negara tujuan'},h('select',{className:inputCls,value:country,onChange:e=>{setCountry(e.target.value);resetQuote();}},
          [['ID','Indonesia'],['SG','Singapura'],['MY','Malaysia'],['TH','Thailand'],['PH','Filipina'],['VN','Vietnam'],['JP','Jepang']].map(([val,txt])=>h('option',{key:val,value:val},txt)))),
        h('p',{className:'text-sm bg-gray-50 border rounded-lg p-3'},'Alamat fixture: TEST ONLY 123 Example Road, Demo City, 000000. Tidak menerima input alamat pribadi.'),
        h('p',{className:'text-xs text-gray-600'},'Penerima: '+MOCK_RECIPIENT+' | '+MOCK_EMAIL),
        h('button',{type:'button',disabled:busy,onClick:getQuote,className:'trs-btn-primary w-full py-3 rounded-lg font-bold disabled:opacity-60'},busy?'Memproses...':'HITUNG ONGKIR SIMULASI'),
        quote&&h('p',{className:'bg-blue-50 text-blue-800 px-3 py-2 rounded text-sm'},quote.label+' ('+quote.service+')'),
        error&&h('p',{role:'alert',className:'text-red-700 text-sm bg-red-50 p-3 rounded'},error)
      ),
      h('div',{className:'bg-white rounded-xl border p-5 h-fit'},
        h('h2',{className:'font-bold text-lg mb-3'},'Ringkasan order'),
        items.map(it=>h('div',{key:it.product.variantId,className:'flex justify-between gap-3 text-xs border-b py-2'},h('span',null,it.product.name+' × '+it.qty),h('strong',null,formatIDR(previewPrice(it.product,it.qty)*it.qty)))),
        h('div',{className:'flex justify-between text-sm my-3'},h('span',null,'Subtotal'),h('strong',null,formatIDR(subtotal))),
        h('div',{className:'flex justify-between text-sm mb-3'},h('span',null,'Ongkir QA'),h('strong',null,quote?formatIDR(quote.costIdr):'Belum dihitung')),
        h('div',{className:'border-t pt-3 font-bold flex justify-between mb-5'},h('span',null,'Total simulasi'),h('span',null,quote?formatIDR(subtotal+quote.costIdr):'-')),
        h('button',{type:'submit',disabled:!quote||busy,className:'trs-btn-primary w-full py-3 rounded-lg font-bold disabled:opacity-40'},busy?'Menyimpan...':'BUAT ORDER PENDING (DEMO)'),
        h('p',{className:'text-xs text-gray-500 mt-3'},'Order dicatat di Neon dan dapat dilihat oleh admin. Tidak ada penagihan.')
      )
    )
  );
}
function ConnectedOrderPage({params}){
  const [order,setOrder]=useState(null),[error,setError]=useState('');
  useEffect(()=>{
    let alive=true;
    const raw=sessionStorage.getItem('trastar_preview_order');
    let key=null;try{key=JSON.parse(raw);}catch{}
    if(!key||key.orderNo!==params.orderId){setError('Bukti akses order tidak ada pada sesi ini.');return;}
    api('/api/orders?orderNo='+encodeURIComponent(key.orderNo),undefined,{'x-order-access-token':key.accessToken}).then(data=>{
      if(alive)setOrder(data.order);
    }).catch(e=>{if(alive)setError(e.message)});
    return ()=>{alive=false};
  },[params.orderId]);
  return h('div',{className:'max-w-3xl mx-auto px-4 py-10'},
    h(Breadcrumb,{items:[{label:'Home',to:'/'},{label:'Order QA'}]}),
    h('h1',{className:'font-display font-extrabold text-2xl mb-3'},'Status pesanan TRASTAR'),
    h('p',{className:'text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-4 mb-5'},
      'Order ini hanya untuk pengujian. Status PAID tidak tersedia, karena payment gateway belum diaktifkan.'),
    error&&h('p',{role:'alert',className:'text-red-700 bg-red-50 p-3'},error),
    !order&&!error&&h('p',null,'Memuat order dari Neon...'),
    order&&h('div',{className:'bg-white rounded-xl border p-5'},
      h('div',{className:'flex justify-between flex-wrap gap-3 border-b pb-4 mb-4'},h('strong',null,order.orderNo),h(Badge,{tone:'outline'},order.paymentStatus+' (DEMO)')),
      order.items.map((it,i)=>h('div',{key:i,className:'flex justify-between text-sm py-2 border-b'},h('span',null,it.name_snapshot+' ('+it.sku_snapshot+') × '+it.quantity),h('span',null,formatIDR(Number(it.line_total_idr))))),
      h('div',{className:'flex justify-between text-sm mt-4'},h('span',null,'Subtotal'),h('strong',null,formatIDR(order.subtotalIdr))),
      h('div',{className:'flex justify-between text-sm mt-2'},h('span',null,'Ongkir simulasi'),h('strong',null,formatIDR(order.shippingCostIdr))),
      h('div',{className:'flex justify-between font-bold text-lg mt-4 pt-3 border-t'},h('span',null,'Total (tidak ditagih)'),h('span',null,formatIDR(order.totalIdr))),
      h('p',{className:'text-gray-500 text-xs mt-4'},'Fulfillment: '+order.fulfillmentStatus+' | Batas order PENDING: '+new Date(order.expiresAt).toLocaleString('id-ID'))
    ),
    h(Link,{to:'/shop',className:'text-[var(--trs-red)] font-bold text-sm mt-6 inline-block'},'KEMBALI KE KATALOG')
  );
}
function ConnectedNoPayment(){
  return h('div',{className:'max-w-xl mx-auto px-4 py-24 text-center'},h('h1',{className:'font-extrabold text-2xl mb-4'},'Pembayaran belum tersedia'),h('p',{className:'text-gray-600 mb-4'},'Untuk uji checkout gunakan alur QA yang mencatat order PENDING tanpa pembayaran.'),h(Link,{to:'/checkout',className:'text-[var(--trs-red)] font-bold'},'KEMBALI KE CHECKOUT'));
}
function toCard(p,v){
  const category=p.category||'Accessories';
  const unitPrice=Number(v.unitPriceIdr);
  return {
    id:v.id,variantId:v.id,
    sku:v.sku,slug:p.slug+'-'+v.sku.toLowerCase().replace(/[^a-z0-9-]/g,'-'),
    name:p.name+(p.variants.length>1?' / '+v.sku:''),
    brand:p.brand||'TRASTAR',
    category,icon:CATEGORIES.find(c=>c.name===category)?.icon||'package',
    price:unitPrice,salePrice:unitPrice,stock:Number(v.availableStock),
    description:p.description||'Produk pengujian TRASTAR. Spesifikasi asli belum diberikan klien.',
    compatibility:[],specs:{SKU:v.sku,'Berat':p.weight_grams+' gram'},
    variants:{},priceTiers:v.tiers||[],
    rating:0,reviewCount:0,exportAllowed:p.export_allowed,weightGrams:p.weight_grams
  };
}
ROUTES.forEach(r=>{
  if(r.pattern==='/cart')r.component=ConnectedCartPage;
  if(r.pattern==='/checkout')r.component=ConnectedCheckoutPage;
  if(r.pattern==='/payment')r.component=ConnectedNoPayment;
  if(r.pattern==='/thank-you')r.component=ConnectedNoPayment;
  if(r.pattern==='/orders/:orderId')r.component=ConnectedOrderPage;
});
window.__trastarStorefrontAdapter={priceForQuantity:previewPrice,makeCartItems:shippingCart};
async function start(){
  const rootElement=document.getElementById('root');
  try{
    const result=await api('/api/products');
    const products=(result.products||[]).flatMap(p=>(p.variants||[]).map(v=>toCard(p,v)));
    PRODUCTS.splice(0,PRODUCTS.length,...products);
    DUMMY_REVIEWS.splice(0);
    catalogReady=true;
    window.startTrastarStorefront();
  }catch(err){
    rootElement.textContent='';
    const notice=document.createElement('div');
    notice.style='max-width:650px;margin:70px auto;padding:24px;border:1px solid #dc2538;border-radius:10px;font:16px system-ui';
    notice.textContent='Katalog development tidak dapat dimuat dari Neon: '+err.message+'. Halaman dummy tidak digunakan sebagai fallback.';
    rootElement.append(notice);
    console.error('TRASTAR catalog load failed',err);
  }
}
start();
})();
