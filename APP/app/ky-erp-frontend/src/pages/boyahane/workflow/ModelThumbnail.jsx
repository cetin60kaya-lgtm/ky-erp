import { useEffect, useState } from "react";
import { assetUrl } from "../../desen/DesenWorkflowShared";

export default function ModelThumbnail({ src, alt = "Desen görseli", size = "small", className = "" }) {
  const resolved = assetUrl(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [resolved]);

  return <span className={`bh-model-thumbnail ${size} ${className}`.trim()}>
    {resolved && !failed
      ? <img src={resolved} alt={alt} onError={() => setFailed(true)} />
      : <span>Görsel yok</span>}
  </span>;
}
