import { Star } from "lucide-react";

// Five stars, `count` of them filled — like a rarity row on a trading card.
export default function Stars({ count, size = 14, max = 5, className = "" }) {
  return (
    <span className={`stars ${className}`} aria-label={`${count} of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          size={size}
          strokeWidth={2.2}
          className={i < count ? "star-on" : "star-off"}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}
