import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoogleIcon } from "@/components/icons/GoogleIcon";

export function GoogleButton({
  onClick,
  loading,
  disabled,
}: {
  onClick: () => void;
  loading: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full gap-3 bg-card font-medium"
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? <Loader2 className="size-5 animate-spin" /> : <GoogleIcon className="size-5" />}
      {loading ? "Abrindo o Google…" : "Continuar com Google"}
    </Button>
  );
}
