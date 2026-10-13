import {
  createRootRoute,
  Link,
  Outlet,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { Button, buttonVariants } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
});

function RootLayout() {
  return (
    <TooltipProvider delay={300}>
      <Outlet />
    </TooltipProvider>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-start gap-3 p-6">
      <h1 className="text-xl font-medium">This page does not exist</h1>
      <Link to="/" className={buttonVariants({ variant: "outline" })}>
        Go to today
      </Link>
    </div>
  );
}

// Catches render errors below it and offers a reload (docs/ARCHITECTURE.md, section 8).
function RouteError({ error }: ErrorComponentProps) {
  return (
    <div className="flex flex-col items-start gap-3 p-6">
      <h1 className="text-xl font-medium">Something went wrong</h1>
      {error instanceof Error && (
        <p className="text-muted-foreground">{error.message}</p>
      )}
      <Button variant="outline" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </div>
  );
}
