import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";
import { Header } from "@/components/shared/header";
import { Footer } from "@/components/shared/footer";
import { CartProvider } from "@/contexts/cart-context";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { CouponPromoDialog } from "@/components/promotions/coupon-promo-dialog";
import { GovernorateSelector } from "@/components/storefront/governorate-selector";

const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "1256853443318259";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CartProvider>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 bg-background pt-[72px] md:pt-[84px]">{children}</main>
        <Footer />
      </div>
      <GovernorateSelector />
      <CartDrawer />
      <CouponPromoDialog />
      <Analytics />
      {/* Meta Pixel */}
      <Script
        id="meta-pixel"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');
          `.trim(),
        }}
      />
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </CartProvider>
  );
}
