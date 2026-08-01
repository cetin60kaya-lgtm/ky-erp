import { useRef, useState } from "react";
import { LoaderCircle, UploadCloud } from "lucide-react";
import {
  scanDesignInbox,
  uploadDesignInbox,
} from "../../services/desenWorkflowApi";

const ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.pdf,.psd,.tif,.tiff,.bmp";

export default function DesenInboxUploadButton({
  activeMainCompany,
  onUploaded,
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const upload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length || busy) return;

    setBusy(true);
    setMessage("");
    try {
      const result = await uploadDesignInbox(activeMainCompany, files);
      await scanDesignInbox(activeMainCompany);
      const uploaded = Number(result?.uploaded || result?.files?.length || 0);
      const rejected = Number(result?.rejected || result?.errors?.length || 0);
      setMessage(
        rejected
          ? `${uploaded} dosya R2'ye yüklendi, ${rejected} dosya kabul edilmedi.`
          : `${uploaded} dosya R2 gelen alanına yüklendi ve tarandı.`,
      );
      onUploaded?.();
    } catch (error) {
      setMessage(error?.message || "Desen görselleri yüklenemedi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dsg-cloud-upload">
      <button
        type="button"
        className="dsg-btn primary"
        disabled={busy || !activeMainCompany?.slug}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (
          <LoaderCircle className="spin" size={16} />
        ) : (
          <UploadCloud size={16} />
        )}
        {busy ? "Yükleniyor…" : "Görsel Yükle"}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept={ACCEPT}
        onChange={upload}
      />
      {message ? <span className="dsg-cloud-upload-message">{message}</span> : null}
    </div>
  );
}
