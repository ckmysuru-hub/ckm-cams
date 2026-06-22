import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const COUNTRY_CODES = [
  { code: "+91", label: "India" },
  { code: "+1", label: "US/Canada" },
  { code: "+44", label: "UK" },
  { code: "+61", label: "Australia" },
  { code: "+65", label: "Singapore" },
  { code: "+971", label: "UAE" },
];

const DEFAULT_COUNTRY_CODE = "+91";

function splitPhone(value) {
  const raw = String(value || "").trim();
  const compact = raw.replace(/[\s()-]/g, "");
  const match = COUNTRY_CODES
    .slice()
    .sort((a, b) => b.code.length - a.code.length)
    .find((country) => compact.startsWith(country.code));

  if (match) {
    return { countryCode: match.code, number: compact.slice(match.code.length) };
  }

  return { countryCode: DEFAULT_COUNTRY_CODE, number: compact.replace(/^\+/, "") };
}

function joinPhone(countryCode, number) {
  const digits = String(number || "").replace(/\D/g, "");
  return digits ? `${countryCode}${digits}` : "";
}

export default function PhoneNumberInput({ value, onChange, inputTestId, selectTestId, placeholder = "98765 43210", required }) {
  const { countryCode, number } = splitPhone(value);

  const updateCountry = (nextCode) => {
    onChange(joinPhone(nextCode, number));
  };

  const updateNumber = (nextNumber) => {
    onChange(joinPhone(countryCode, nextNumber));
  };

  return (
    <div className="flex gap-2">
      <Select value={countryCode} onValueChange={updateCountry}>
        <SelectTrigger className="w-[132px] shrink-0" data-testid={selectTestId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COUNTRY_CODES.map((country) => (
            <SelectItem key={country.code} value={country.code}>
              {country.code} {country.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        data-testid={inputTestId}
        inputMode="tel"
        autoComplete="tel-national"
        placeholder={placeholder}
        value={number}
        onChange={(e) => updateNumber(e.target.value)}
        required={required}
      />
    </div>
  );
}

