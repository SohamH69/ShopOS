import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../components/ui";
import { errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";

export interface DemoLogin {
  /** Signs in to the demo shop, then opens /app. A failure shows as a toast. */
  openDemo: () => void;
  pending: boolean;
}

/** "Try the demo shop" for public pages (the landing page, /download). */
export function useDemoLogin(): DemoLogin {
  const { demoLogin } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  // A ref as well as state, so a quick double tap can't start two sign-ins.
  const inFlight = useRef(false);

  const openDemo = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    demoLogin()
      .then(() => navigate("/app"))
      .catch((error: unknown) => {
        toast.error("The demo shop didn't open", { description: errorMessage(error) });
      })
      .finally(() => {
        inFlight.current = false;
        setPending(false);
      });
  }, [demoLogin, navigate, toast]);

  return { openDemo, pending };
}
