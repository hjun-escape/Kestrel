import React from "react";

// Persistent live region so screen readers announce errors when they appear.
// The container always renders; only its content changes.
export default function FormError({ id = "form-error", message }) {
  return (
    <div id={id} role="alert" aria-live="assertive" aria-atomic="true">
      {message ? (
        <p className="mb-5 border-l-2 border-red-700 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          <span className="font-semibold">Could not continue. </span>
          {message}
        </p>
      ) : null}
    </div>
  );
}
