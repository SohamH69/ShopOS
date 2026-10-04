import { RotateCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, EmptyState } from "../ui";
import styles from "./PageLoader.module.css";

interface RouteErrorBoundaryProps {
  children: ReactNode;
  /** Clears the error when it changes (pass the pathname so navigating away recovers). */
  resetKey?: string;
  /** Centre on a blank page instead of inside the shell's content area. */
  fullPage?: boolean;
}

interface RouteErrorBoundaryState {
  error: Error | null;
}

// After a new deploy, old page chunks disappear; the browser reports a failed dynamic import.
const CHUNK_ERROR = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i;

/** Catches render errors (and failed page-code downloads) so one broken page never blanks the app. */
export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(previous: RouteErrorBoundaryProps) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error("ShopOS page error:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const updated = CHUNK_ERROR.test(error.message);
    const content = (
      <EmptyState
        title={updated ? "ShopOS has been updated" : "This page ran into a problem"}
        description={
          updated
            ? "Reload to get the latest version. Nothing you saved is lost."
            : "Reload the page to try again. If it keeps happening, sign out and sign back in."
        }
        action={
          <Button variant="primary" icon={<RotateCw aria-hidden="true" />} onClick={() => window.location.reload()}>
            Reload
          </Button>
        }
      />
    );
    if (this.props.fullPage) {
      return (
        <div className={styles.screen}>
          <div className={styles.screenCard}>{content}</div>
        </div>
      );
    }
    return (
      <div className={styles.inline}>
        <div className={styles.inlineCard}>{content}</div>
      </div>
    );
  }
}
