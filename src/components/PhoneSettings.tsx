import qrcode from "qrcode-generator";
import { useMemo, useState } from "react";

import type { Phone } from "../engine/usePhone";
import { useT } from "../lib/i18n";
import { Select } from "./Select";

/** The address as a QR code: dark on white whatever the theme, as cameras read it best. */
const QrCode = ({ text }: { text: string }) => {
  const svg = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 3, scalable: true });
  }, [text]);
  return (
    <div
      className="size-44 shrink-0 overflow-hidden rounded-card bg-white p-1 [&_svg]:size-full"
      // the library's own SVG, made from the address alone
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

/** Settings → From your phone: switch the page on, and the code to open it with. */
export const PhoneSettings = ({ phone }: { phone: Phone }) => {
  const t = useT();
  const [chosen, setChosen] = useState(0);
  const url = phone.urls[Math.min(chosen, phone.urls.length - 1)];

  return (
    <div className="mb-8 space-y-4">
      <label className="flex cursor-pointer items-start justify-between gap-6">
        <span>
          <span className="block text-sm">{t.phoneOn}</span>
          <span className="block text-xs text-muted">{t.phoneOnAbout}</span>
        </span>
        <input
          type="checkbox"
          checked={phone.on}
          onChange={(e) => phone.change(e.target.checked)}
          className="mt-1 size-4 accent-accent"
        />
      </label>

      {phone.on && phone.problem && <p className="text-sm text-danger">{phone.problem}</p>}
      {phone.on && !phone.problem && !url && <p className="text-sm text-warn">{t.phoneNoNetwork}</p>}
      {phone.on && url && (
        <div className="flex items-start gap-5 rounded-card border border-line bg-surface p-4">
          <QrCode text={url} />
          <div className="min-w-0 space-y-3 text-sm">
            <p>{t.phoneScan}</p>
            <p className="text-xs text-muted">{t.phoneOr}</p>
            <p dir="ltr" className="break-all rounded-control bg-bg p-2 font-mono text-xs text-muted select-text">
              {url.split("#")[0]}
            </p>
            {phone.urls.length > 1 && (
              <Select
                className="w-56"
                label={t.phoneNetwork}
                value={String(chosen)}
                options={phone.urls.map((u, i) => [new URL(u).hostname, String(i)])}
                onChange={(v) => setChosen(Number(v))}
              />
            )}
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => void phone.newKey()} className="rounded-control bg-raised px-3 py-1.5 hover:bg-hover">
                {t.phoneNewKey}
              </button>
              <span className="text-xs text-muted">{t.phoneNewKeyAbout}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
