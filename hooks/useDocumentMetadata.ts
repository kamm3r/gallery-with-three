import { useEffect } from 'react';

export function useDocumentMetadata(title: string, description?: string) {
  useEffect(() => {
    document.title = title;

    if (!description) return;
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]'
    );
    meta?.setAttribute('content', description);
  }, [description, title]);
}
