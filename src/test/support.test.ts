import { describe, it, expect } from "vitest";
import { approvedAnswer, supportAnswers } from "@/lib/policies";
import { ownerMatches, contactSchema, SUPPORT_LIMIT } from "@/lib/support-schema";
import { readSupportJson } from "@/lib/support-input.server";
describe("support restrictions",()=>{
 it("unknown AI selection returns only the scope policy",()=>{expect(approvedAnswer("invented-refund")).toBe(supportAnswers.find(a=>a.id==="scope")?.text);});
 it("owner configuration fails closed when missing",()=>{expect(ownerMatches("person@example.com","")).toBe(false);});
 it("a logged-in non-owner is refused",()=>{expect(ownerMatches("visitor@example.com","owner@example.com")).toBe(false);});
 it("only the configured owner email is accepted",()=>{expect(ownerMatches("OWNER@example.com","owner@example.com")).toBe(true);});
 it("support contact rejects invalid email and overly long message",()=>{expect(contactSchema.safeParse({name:"A",email:"bad",message:"Hello"}).success).toBe(false);expect(contactSchema.safeParse({name:"A",email:"a@example.com",message:"x".repeat(3001)}).success).toBe(false);});
 it("support budget is ten requests per hour",()=>{expect(SUPPORT_LIMIT).toBe(10);});
 it("oversized body without content-length is rejected before parsing",async()=>{await expect(readSupportJson(new Request("https://example.com",{method:"POST",body:"x".repeat(20001)}))).rejects.toThrow("Message too long");});
});