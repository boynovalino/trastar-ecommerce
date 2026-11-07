import { HttpError } from './http.js';
export function quantity(n) {
  if(!Number.isSafeInteger(n) || n < 1 || n > 999) throw new HttpError(422,'INVALID_QUANTITY','Quantity must be between 1 and 999');
  return n;
}
export function unitPriceForQty(basePrice, tiers, qty) {
  quantity(qty);
  const base=Number(basePrice);
  if(!Number.isSafeInteger(base) || base<0) throw new Error('Invalid stored price');
  const ordered = [...tiers].sort((a,b)=>Number(a.min_qty)-Number(b.min_qty));
  let price=base;
  for(const tier of ordered){
    if(qty>=Number(tier.min_qty)) price=Number(tier.unit_price_idr);
  }
  if(!Number.isSafeInteger(price) || price<0) throw new Error('Invalid stored tier');
  return price;
}
export function normalizeItems(items) {
  if(!Array.isArray(items) || items.length<1 || items.length>50) throw new HttpError(422,'INVALID_CART','Cart must have between 1 and 50 lines');
  const grouped=new Map();
  for(const item of items){
    if(!item || typeof item.variantId!=='string' || !/^[0-9a-f-]{36}$/i.test(item.variantId)) throw new HttpError(422,'INVALID_VARIANT','Invalid product variant');
    const id=item.variantId.toLowerCase();
    grouped.set(id, quantity(Number(item.quantity))+(grouped.get(id)||0));
  }
  return [...grouped].map(([variantId,qty])=>({variantId,quantity:quantity(qty)})).sort((a,b)=>a.variantId.localeCompare(b.variantId));
}
