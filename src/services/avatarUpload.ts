const AVATAR_SIZE_STEPS = [256, 224, 192, 160];
const AVATAR_QUALITY_STEPS = [0.84, 0.72, 0.58, 0.45];
const MAX_AVATAR_DATA_URL_CHARS = 350_000;

export async function processAvatarFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecione um arquivo de imagem válido (JPG, PNG ou WebP).');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Não foi possível carregar a imagem selecionada.'));
    el.src = dataUrl;
  });

  const minSide = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
  if (!minSide) {
    throw new Error('Imagem vazia ou inválida.');
  }

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const sx = Math.max(0, Math.floor((srcW - minSide) / 2));
  const sy = Math.max(0, Math.floor((srcH - minSide) / 2));

  const canvas = document.createElement('canvas');
  let output = '';

  for (const sizePx of AVATAR_SIZE_STEPS) {
    canvas.width = sizePx;
    canvas.height = sizePx;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Navegador não suporta processamento de imagem.');
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, sizePx, sizePx);
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, sizePx, sizePx);

    for (const quality of AVATAR_QUALITY_STEPS) {
      output = canvas.toDataURL('image/jpeg', quality);
      if (output.length <= MAX_AVATAR_DATA_URL_CHARS) {
        return output;
      }
    }
  }

  return output;
}
