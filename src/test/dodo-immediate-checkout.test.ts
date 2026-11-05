// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({verify:vi.fn(),checkout:vi.fn(),validate:vi.fn(),writes:[] as any[],pack:5,ready:vi.fn()}));
vi.mock("@tanstack/react-start",()=>({createServerFn:()=>({inputValidator(){return this;},handler(fn:any){return (arg:any)=>fn(arg);}})}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:()=>new Request("https://tugg.lol/m/a"),getRequestIP:()=>"local-fixture"}));
vi.mock("@/lib/turnstile.server",()=>({verifyTurnstileForRequest:state.verify}));
vi.mock("@/lib/payments/selection.server",()=>({paymentReadiness:state.ready,selectedProduct:(kind:string)=>`product-${kind}`,selectedProvider:()=>({environment:"sandbox",validateProduct:state.validate,checkout:state.checkout})}));
vi.mock("@/integrations/supabase/client.server",()=>({supabaseAdmin:{rpc:async()=>({data:true,error:null}),from:(table:string)=>{
 let inserted:any;const q:any={select:()=>q,eq:()=>q,is:()=>q,insert:(v:any)=>{inserted=v;state.writes.push({table,value:v});return q;},update:(v:any)=>{state.writes.push({table,value:v});return q;},single:async()=>({error:null,data:table==="sides"?{matchups:{status:"active"}}:{id:inserted?.id}}),then:(r:any)=>r({error:null})};return q;
}}));
import { buyImmediateBundle } from "@/lib/immediate-payments.functions";
beforeEach(()=>{vi.stubEnv("PAYMENT_PROVIDER","dodo");vi.stubEnv("PAUSE_PULLS","false");state.writes=[];state.ready.mockReset();state.verify.mockReset();state.validate.mockReset();state.checkout.mockReset().mockResolvedValue({sessionId:"cs",url:"https://checkout.dodopayments.com/test"});});
it.each([5,10,25] as const)("creates a %i-pull immediate order and fixed-product checkout without a wallet",async pack=>{
 const result=await buyImmediateBundle({data:{sideId:"12345678-1234-4234-8234-123456789abc",pack,name:"",shout:"",returnUrl:"https://tugg.lol/m/a",turnstileToken:"fixture"}});
 expect(result).toMatchObject({provider:"dodo",environment:"sandbox",url:"https://checkout.dodopayments.com/test"});
 expect(state.validate).toHaveBeenCalledWith(`product-pull_${pack}`,pack*100);
 expect(state.writes[0]).toMatchObject({table:"dodo_orders",value:{side_id:"12345678-1234-4234-8234-123456789abc",quantity:pack,expected_cents:pack*100}});
 expect(state.writes.some(r=>r.table.includes("wallet"))).toBe(false);
 expect(state.checkout).toHaveBeenCalledWith(expect.objectContaining({productId:`product-pull_${pack}`,orderId:state.writes[0].value.id}));
 expect(state.writes[0].value.wallet_id).toBeUndefined();
});
it("PAUSE_PULLS blocks all checkout side effects",async()=>{vi.stubEnv("PAUSE_PULLS","true");expect(await buyImmediateBundle({data:{} as any})).toHaveProperty("error");expect(state.writes).toEqual([]);expect(state.verify).not.toHaveBeenCalled();expect(state.checkout).not.toHaveBeenCalled();});
it("missing setup fails closed with a clear error",async()=>{state.ready.mockImplementation(()=>{throw new Error("Dodo checkout is not configured yet.")});expect(await buyImmediateBundle({data:{} as any})).toHaveProperty("error","Dodo checkout is not configured yet.");expect(state.checkout).not.toHaveBeenCalled();});
it("failed Turnstile cannot create a purchase",async()=>{state.verify.mockRejectedValue(new Error("Security check failed"));expect(await buyImmediateBundle({data:{turnstileToken:"invalid"} as any})).toHaveProperty("error","Security check failed");expect(state.writes).toEqual([]);expect(state.checkout).not.toHaveBeenCalled();});