import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ navigate: vi.fn(), update: vi.fn(async () => ({ error: null })) }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: unknown }) => ({ options, useSearch: () => ({ client: true }) }),
  useNavigate: () => mocks.navigate,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  getSession: async () => ({ data: { session: { user: { id: "buyer" } } } }),
  updateUser: mocks.update,
} } }));
import { Route } from "@/routes/reset-password";
describe("buyer password recovery destination", () => {
  it("returns the recovered buyer to their library, without touching an actual account", async () => {
    const Page = Route.options.component as () => React.JSX.Element;
    render(<Page />);
    fireEvent.change(await screen.findByLabelText("Nouveau mot de passe"), { target: { value: "test-only-password" } });
    fireEvent.change(screen.getByLabelText("Confirmer"), { target: { value: "test-only-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: "/mes-achats" }));
  });
});