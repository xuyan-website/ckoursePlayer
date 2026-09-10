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
            "!bg-card !border-success !text-success",
          error:
            "!bg-card !border-destructive !text-destructive",
          info:
            "!bg-card !border-info !text-info",
          warning:
            "!bg-card !border-amber-500 !text-amber-500",
          loading:
            "!bg-card !border-info !text-info",
        },
      }}
    />
  );
}
