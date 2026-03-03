import { Header } from "@/components/shared/header";
import { Footer } from "@/components/shared/footer";
import { CartProvider } from "@/contexts/cart-context";
import { CartDrawer } from "@/components/cart/cart-drawer";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CartProvider>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 bg-background pt-[72px]">{children}</main>
        <Footer />
      </div>
      <CartDrawer />
    </CartProvider>
  );
}
