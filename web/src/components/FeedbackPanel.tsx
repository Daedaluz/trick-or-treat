import { useState } from "react";
import { api } from "../api";

interface Props {
  onClose: () => void;
}

export default function FeedbackPanel({ onClose }: Props) {
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.sendFeedback({ message: message.trim(), contact: contact.trim() });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="add-panel">
        <div className="sheet-head">
          <strong>Thank you! 👻</strong>
          <button type="button" className="link" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted">Your feedback was sent. Only the person running this service can read it.</p>
      </div>
    );
  }

  return (
    <form className="add-panel" onSubmit={submit}>
      <div className="sheet-head">
        <strong>Feedback</strong>
        <button type="button" className="link" onClick={onClose}>
          Cancel
        </button>
      </div>

      <label>
        What should be better?
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="An idea, a bug, a thank-you…"
          maxLength={2000}
          rows={5}
          required
          autoFocus
        />
      </label>

      <label>
        How to reach you (optional)
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="Email or phone"
          maxLength={200}
          autoComplete="email"
        />
        <span className="hint">Only if you want a reply. It is never shown to anyone else.</span>
      </label>

      {error && <div className="error">{error}</div>}

      <button className="primary wide" type="submit" disabled={busy || message.trim().length < 3}>
        {busy ? "Sending…" : "Send feedback"}
      </button>
    </form>
  );
}
