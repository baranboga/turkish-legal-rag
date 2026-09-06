# results/

Her kosu kendi klasorunde durur (`src/config.ts` icindeki `CURRENT_RUN`).
Bu klasorlerdeki dosyalar **script'ler tarafindan uretilir** (elle yazilmaz) ve
UI yalnizca buradan okur.

```
results/<run>/
  embed-stats.json     # npm run embed      — embedding sure/token/maliyet
  pinecone-stats.json  # npm run pinecone   — upsert sureleri
  benchmark.json       # npm run benchmark  — latency, recall@5, per-query top5 (UI kaynagi)
  benchmark.md         # npm run benchmark  — insan okunur tablo (sadece sayi, yorum yok)
  sync-test.md         # npm run sync-test  — sync davranisi (UI kaynagi)
```

Aktif kosu: **week-05-06**. Ilerideki haftalarda `CURRENT_RUN` degistiginde yeni
klasor olusur; eski sonuclar yan yana durmaya devam eder ve karsilastirilabilir.
