"use client";

import type { DeliveryDistance, FreeDeliveryOffer, Locale } from "@talad/shared";
import { CircleCheck, MapPin, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { deliveryDistance } from "@/lib/delivery-actions";
import { interpolate } from "@/lib/format";

export interface FreeDeliveryLabels {
  title: string;
  youAreFree: string;
  youAreFar: string;
  pinToCheck: string;
  pinLink: string;
}

/**
 * "Free delivery within 3 km of the shop", and — for a signed-in customer — whether their
 * default address is close enough (or a link to pin it so it can be checked).
 */
export function FreeDeliveryBadge({
  shopId,
  offer,
  locale,
  labels,
  className = "",
}: {
  shopId: string;
  offer: FreeDeliveryOffer;
  locale: Locale;
  labels: FreeDeliveryLabels;
  className?: string;
}) {
  const [mine, setMine] = useState<DeliveryDistance | null>(null);

  useEffect(() => {
    let live = true;
    void deliveryDistance(shopId).then((d) => live && setMine(d));
    return () => {
      live = false;
    };
  }, [shopId]);

  const km = (n: number) => n.toLocaleString(locale === "lo" ? "lo-LA" : "en-US", { maximumFractionDigits: 1 });
  return (
    <div className={`flex items-start gap-3 rounded-xl bg-primary-soft px-4 py-3 ${className}`}>
      <Zap className="mt-0.5 size-6 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="font-semibold">{[interpolate(labels.title, { km: km(offer.radiusKm) }), offer.eta].filter(Boolean).join(" · ")}</p>
        {mine?.distanceKm != null ? (
          <p className={`mt-0.5 flex items-center gap-1.5 text-sm ${mine.free ? "font-semibold text-primary" : "text-muted-foreground"}`}>
            {mine.free ? <CircleCheck className="size-4 shrink-0" /> : <MapPin className="size-4 shrink-0" />}
            {interpolate(mine.free ? labels.youAreFree : labels.youAreFar, { km: km(mine.distanceKm) })}
          </p>
        ) : (
          // Signed in with an address that has no pin yet: show where to pin it.
          mine?.addressId && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {labels.pinToCheck}{" "}
              <Link href={`/${locale}/account/addresses`} className="font-semibold text-primary hover:underline">
                {labels.pinLink}
              </Link>
            </p>
          )
        )}
      </div>
    </div>
  );
}
