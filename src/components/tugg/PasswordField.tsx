import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MIN_PASSWORD_LENGTH } from "@/lib/email-auth-schema";

export function PasswordField({ id, label, value, onChange, newPassword = false }: { id: string; label: string; value: string; onChange: (value: string) => void; newPassword?: boolean }) {
  const [visible, setVisible] = useState(false);
  return <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <div className="relative">
      <Input id={id} name={id} type={visible ? "text" : "password"} value={value} onChange={event => onChange(event.target.value)} required minLength={MIN_PASSWORD_LENGTH} maxLength={256} autoComplete={newPassword ? "new-password" : "current-password"} className="h-12 pr-12 text-base" />
      <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-10 w-10" aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} title={visible ? "Hide password" : "Show password"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</Button>
    </div>
  </div>;
}