import { describe, expect, it } from "vitest";
import { claimIncomingRing, releaseIncomingRing } from "../lib/call-ring-coordinator";
const memoryStorage = () => { const values = new Map<string,string>(); return { getItem:(k:string)=>values.get(k)??null, setItem:(k:string,v:string)=>void values.set(k,v), removeItem:(k:string)=>void values.delete(k) }; };
describe("incoming ring coordinator", () => {
  it("allows only one tab to ring until its lease expires", () => { const s=memoryStorage(); expect(claimIncomingRing(s,"c","a",1000)).toBe(true); expect(claimIncomingRing(s,"c","b",2000)).toBe(false); expect(claimIncomingRing(s,"c","b",5001)).toBe(true); });
  it("only lets the owner release a lease", () => { const s=memoryStorage(); claimIncomingRing(s,"c","a",1000); releaseIncomingRing(s,"b"); expect(claimIncomingRing(s,"c","b",2000)).toBe(false); releaseIncomingRing(s,"a"); expect(claimIncomingRing(s,"c","b",2000)).toBe(true); });
});
