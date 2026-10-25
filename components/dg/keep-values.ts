import { startTransition } from "react";

/**
 * React 19 resets a form after its action runs, which would clear what the user typed when the
 * server returns validation errors. With JS we submit through onSubmit instead (values stay);
 * without JS the plain `action` attribute still posts the form.
 */
export function keepValues(formAction: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => formAction(fd));
  };
}
