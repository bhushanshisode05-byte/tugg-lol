// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
const fixture="whsec_"+Buffer.from("public-dodo-webhook-unit-fixture").toString("base64");
const state=vi.hoisted(()=>({process:vi.fn(),rows:new Map<string,any>(),leased:new Set<string>()}));
vi.mock("@tanstack/react-router",()=>({createFileRoute:()=> (options:any)=>options}));
vi.mock("@/lib/payments/fulfillment.server",async()=>{
 const {z}=await import("zod");return {processDodoEvent:state.process,webhookPayload:z.object({type:z.string(),data:z.object({payment_id:z.string()})})};
});
vi.mock("@/integrations/supabase/client.server",()=>({supabaseAdmin:{
 rpc:async(_name:string,args:any)=>{if(state.leased.has(args.p_id))return {data:false,error:null};state.leased.add(args.p_id);return {data:true,error:null};},
 from:(table:string)=>{let id="";const q:any={upsert:async(v:any)=>{if(!state.rows.has(v.id))state.rows.set(v.id,{...v,status:"pending"});return {error:null};},select:()=>q,eq:(_k:string,v:string)=>{id=v;return q;},single:async()=>({data:state.rows.get(id),error:null}),update:(v:any)=>{return {...q,eq:(_k:string,key:string)=>{Object.assign(state.rows.get(key),v);return Promise.resolve({error:null});}};},insert:async()=>({error:null})};return q;},
}}));
import { Route } from "@/routes/api/public/payments/dodo/webhook";
const handler=(Route as any).server.handlers.POST;
function request(raw:string,env="sandbox",signatureRaw=raw,age=0){const timestamp=Math.floor(Date.now()/1000)-age;const signature=createHmac("sha256",Buffer.from(fixture.slice(6),"base64")).update(`evt.${timestamp}.${signatureRaw}`).digest("base64");return new Request(`https://tugg.lol/api/public/payments/dodo/webhook?env=${env}`,{method:"POST",headers:{"webhook-id":"evt","webhook-timestamp":String(timestamp),"webhook-signature":`v1,${signature}`},body:raw});}
const raw=JSON.stringify({type:"payment.succeeded",data:{payment_id:"pay"}});
beforeEach(()=>{vi.stubEnv("PAYMENT_PROVIDER","dodo");vi.stubEnv("PAYMENTS_ENV","sandbox");vi.stubEnv("DODO_TEST_API_KEY","public-api-fixture");vi.stubEnv("DODO_TEST_WEBHOOK_SECRET",fixture);state.rows.clear();state.leased.clear();state.process.mockReset();});
it("valid signed delivery is persisted, processed and deduplicated by webhook id",async()=>{
 expect((await handler({request:request(raw)})).status).toBe(200);
 const duplicate=await handler({request:request(raw)});expect(await duplicate.json()).toHaveProperty("duplicate",true);expect(state.process).toHaveBeenCalledTimes(1);expect(state.rows.size).toBe(1);
});
it("tampered webhook never reaches fulfillment",async()=>{expect((await handler({request:request(raw,"sandbox","different")})).status).toBe(400);expect(state.process).not.toHaveBeenCalled();});
it("expired signature never reaches fulfillment",async()=>{expect((await handler({request:request(raw,"sandbox",raw,301)})).status).toBe(400);expect(state.process).not.toHaveBeenCalled();});
it("wrong environment never reaches fulfillment",async()=>{expect((await handler({request:request(raw,"live")})).status).toBe(403);expect(state.process).not.toHaveBeenCalled();});
it("missing credentials refuses delivery",async()=>{vi.stubEnv("DODO_TEST_API_KEY","");expect((await handler({request:request(raw)})).status).toBe(503);expect(state.process).not.toHaveBeenCalled();});