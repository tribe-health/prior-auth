import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { AnnotationDisposition as Disposition } from '../model/annotation';

export function AnnotationDisposition({
  value,
  disabled,
  onChange,
}: {
  value: Disposition;
  disabled?: boolean;
  onChange: (value: Disposition) => void;
}) {
  return (
    <RadioGroup
      aria-label="How this annotation may be used"
      value={value}
      disabled={disabled}
      onValueChange={(next) => onChange(next as Disposition)}
      className="grid gap-2 sm:grid-cols-2"
    >
      <FieldLabel>
        <Field orientation="horizontal">
          <RadioGroupItem value="included" />
          <FieldContent>
            <FieldTitle>Include in the letter</FieldTitle>
            <FieldDescription>Use this as attributed clinical opinion.</FieldDescription>
          </FieldContent>
        </Field>
      </FieldLabel>
      <FieldLabel>
        <Field orientation="horizontal">
          <RadioGroupItem value="held" />
          <FieldContent>
            <FieldTitle>Keep out of this letter</FieldTitle>
            <FieldDescription>Retain it for review, peer discussion, or appeal.</FieldDescription>
          </FieldContent>
        </Field>
      </FieldLabel>
    </RadioGroup>
  );
}
