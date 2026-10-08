import { METHODS } from "../lib/list";

/** Click method of a spam challenge: free text with suggestions */
export default function MethodInput({ value, onChange, className = "input" }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <>
      <input className={className} list="methods" value={value} maxLength={40} placeholder="e.g. Alternating" onChange={(e) => onChange(e.target.value)} />
      <datalist id="methods">
        {METHODS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </>
  );
}
