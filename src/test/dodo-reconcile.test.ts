// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({rows:[] as any[],expired:0,provider:vi.fn(),process:vi.fn(),updates:[] as any[],mode:"dodo"}));
vi.mock("@/lib/server-utils.server",()=>({config:()=>({paymentProvider:state.mode,paymentsEnv:"sandbox"})}));
vi.mock("@/lib/payments/dodo.server",()=>({createDodoProvider:state.provider}));
vi.mock("@/lib/payments/fulfillment.server",()=>({processDodoEvent:state.process}));
vi.mock("@/integrations/supabase/client.server",()=>({supabaseAdmin:{
  rpc:async()=>({data:{rows:state.rows,expired:state.expired},error:null}),
  from:()=>{const q:any={select:()=>q,eq:()=>q,update:(v:any)=>{state.updates.push(v);return q;},insert:()=>q,single:async()=>({data:{status:"paid"},error:null}),then:(r:any)=>r({error:null})};return q;},
}}));
import { reconcileDodo } from "@/lib/payments/dodo-reconcile.server";
beforeEach(()=>{state.rows=[];state.expired=0;state.mode="dodo";state.updates=[];state.provider.mockReset();state.process.mockReset();});
it("empty pending batch needs no credentials and performs zero provider calls",async()=>{
 expect(await reconcileDodo()).toEqual({checked:0,finalized:0,expired:0,errors:0});expect(state.provider).not.toHaveBeenCalled();
});
it("expired orders stop before provider setup",async()=>{state.expired=1;expect(await reconcileDodo()).toHaveProperty("expired",1);expect(state.provider).not.toHaveBeenCalled();});
it("PayGlocal selection leaves Dodo dormant",async()=>{state.mode="payglocal";expect(await reconcileDodo()).toHaveProperty("skipped");expect(state.provider).not.toHaveBeenCalled();});
const row={id:"12345678-1234-4234-8234-123456789abc",checkout_id:"cs",payment_id:null,reconcile_count:2};
it("recovers stored checkout through Dodo status then verified payment",async()=>{
 state.rows=[row];const payment={payment_id:"p",status:"succeeded",metadata:{tugg_order_id:row.id}};
 const provider={checkoutStatus:vi.fn(async()=>({payment_id:"p"})),payment:vi.fn(async()=>payment)};state.provider.mockReturnValue(provider);
 expect(await reconcileDodo()).toMatchObject({checked:1,finalized:1,errors:0});
 expect(provider.checkoutStatus).toHaveBeenCalledWith("cs");expect(provider.payment).toHaveBeenCalledWith("p");
 expect(state.process).toHaveBeenCalledWith({type:"payment.succeeded",data:{payment_id:"p"}},provider,payment);
 expect(state.updates).toContainEqual(expect.objectContaining({reconcile_count:3,reconcile_result:"paid"}));
});
it("pending status never applies a bundle",async()=>{state.rows=[row];state.provider.mockReturnValue({checkoutStatus:async()=>({payment_id:"p"}),payment:async()=>({status:"processing"})});await reconcileDodo();expect(state.process).not.toHaveBeenCalled();});
it("cross-order status is refused before fulfillment",async()=>{state.rows=[{...row,payment_id:"stored"}];state.provider.mockReturnValue({checkoutStatus:async()=>({payment_id:"other"})});expect(await reconcileDodo()).toHaveProperty("errors",1);expect(state.process).not.toHaveBeenCalled();});