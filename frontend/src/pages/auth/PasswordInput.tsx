import { Eye, EyeOff } from "lucide-react";
import { useState, type Ref } from "react";
import { IconButton, Input } from "../../components/ui";

export interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  inputRef?: Ref<HTMLInputElement>;
  disabled?: boolean;
}

/** A large password field with a show/hide toggle. Put it inside a <Field> for its label. */
export function PasswordInput({ value, onChange, autoComplete, inputRef, disabled }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      ref={inputRef}
      size="lg"
      type={visible ? "text" : "password"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      autoComplete={autoComplete}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      maxLength={128}
      disabled={disabled}
      trailing={
        <IconButton
          label="Show password"
          icon={visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          aria-pressed={visible}
          onClick={() => setVisible((shown) => !shown)}
          disabled={disabled}
        />
      }
    />
  );
}
