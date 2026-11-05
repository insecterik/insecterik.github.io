# Biodiversidad de Tibirita
Proyecto para GitHub Pages + Decap CMS + Cloudflare.

## Datos estáticos

El catálogo se publica también en `data.json`, generado a partir de `content/*.md`:

```bash
node scripts/build-data.mjs
```

El flujo `.github/workflows/build-data.yml` regenera y guarda `data.json` cuando cambia el contenido, para que las páginas no dependan de la API de GitHub.

## Páginas interactivas

- `linea-tiempo.html`: calendario y cronología de observaciones.
- `comparador.html`: comparación de dos o tres especies.
- `estadisticas.html`: gráficas con exportación PNG.