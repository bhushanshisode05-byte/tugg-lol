import { Input } from "@/components/ui/input";
import type { Billing } from "@/lib/payments/billing";
export const emptyBilling: Billing = { firstName:"", lastName:"", emailId:"", addressCountry:"", addressStreet1:"", addressCity:"", addressState:"", addressPostalCode:"" };
export function BillingFields({ value, onChange }: { value: Billing; onChange: (v: Billing) => void }) {
  return <fieldset className="mt-5 grid gap-3 sm:grid-cols-2"><legend className="mb-3 font-semibold">Billing details</legend>
    {([ ["firstName","First name"], ["lastName","Last name"], ["emailId","Email"], ["addressCountry","Country (3-letter code, e.g. USA / IND)"], ["addressStreet1","Street address"], ["addressCity","City"], ["addressState","State / region"], ["addressPostalCode","Postal code"] ] as const).map(([key,label]) => <label key={key} className="text-sm">{label}<Input className="mt-1" type={key === "emailId" ? "email" : "text"} value={value[key]} maxLength={key === "addressCountry" ? 3 : key === "emailId" ? 254 : 100} onChange={e=>onChange({...value,[key]:key === "addressCountry" ? e.target.value.toUpperCase() : e.target.value})}/></label>)}
  </fieldset>;
}