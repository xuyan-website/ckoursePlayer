import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "!font-sans !rounded-xl",
          description: "!text-muted-foreground",
          default:
            "!bg-card !border-border !text-foreground",
          success:
            "!bg-success/10 !border-success/50 !text-success",
          error:
            "!bg-destructive/10 !border-destructive/50 !text-destructive",
          info:
            "!bg-info/10 !border-info/50 !text-info",
          warning:
            "!bg-amber-500/10 !border-amber-500/50 !text-amber-500",
          loading:
            "!bg-info/10 !border-info/50 !text-info",
        },
      }}
    />
  );
}
