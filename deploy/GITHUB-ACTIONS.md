# GitHub orqali avtomatik deploy

Workflow: `.github/workflows/ci.yml`. `main`ga push qilinganda Verify jobidagi
build, test va audit tekshiruvlari o'tsa, production deploy boshlanadi.
Pull requestlar serverga chiqarilmaydi. Bir vaqtda faqat bitta deploy ishlaydi.

## Bir martalik sozlash

1. Google Cloud → hr-recuriter → Edit → SSH keys → Add item: mahalliy
   `.local/deploy/github_actions_ed25519.pub` faylining to'liq mazmunini kiriting.
   Eski kalitlarni o'chirmang. Save bosing.
2. GitHub → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Qiymat |
|---|---|
| `DEPLOY_HOST` | `34.176.204.70` |
| `DEPLOY_USER` | `dilshodbektohirov40` |
| `DEPLOY_SSH_KEY` | `.local/deploy/github_actions_ed25519` faylining to'liq mazmuni |
| `DEPLOY_KNOWN_HOSTS` | `.local/deploy/github_known_hosts` faylining to'liq mazmuni |

Private keyni faqat GitHub Secret maydoniga kiriting. Chatga yubormang va Git'ga
qo'shmang. `.local` allaqachon `.gitignore` orqali chiqarilgan.

3. GitHub Settings → Environments → `production` uchun deployment branchni
   `main` bilan cheklang. Avtomatik deploy uchun required reviewer shart emas.
4. Hozir serverda ishlayotgan ilova o'zgarishlari, Dockerfilelar, migratsiyalar va
   `deploy/` fayllari ham GitHub'ga commit qilingan bo'lishi kerak. Faqat workflow
   faylini push qilish eski ilova kodini chiqarishi mumkin. O'zgarishlarni ko'rib,
   maxfiy fayllarsiz commit qilib `main`ga push qiling.
5. GitHub → Actions → Verify orqali `test` va `deploy` natijalarini kuzating.

## Serverda nima bo'ladi

Tekshirilgan commit `~/hr-recruiter/releases/<SHA>` ichiga olinadi. `.env` asosiy
papkada qoladi. Docker builddan so'ng bazaning zaxirasi `~/hr-recruiter/backups`
ichiga yoziladi, konteynerlar yangilanadi va HTTP tekshiruvlari bajariladi.
Muvaffaqiyatli release `~/hr-recruiter/current` orqali ochiladi.

CI deploydan keyin serverdagi boshqaruv buyruqlarini shu papkada bajaring:

```sh
cd ~/hr-recruiter/current
export DEPLOY_SHA=$(cat "$HOME/hr-recruiter/deployed-sha")
docker compose -p ai-hr-recruiter -f compose.yaml -f deploy/compose.production.yaml -f deploy/compose.ci.yaml --profile app ps
```

Migration xatosi yoki health check xatosi deployni muvaffaqiyatsiz belgilaydi.
Avtomatik rollback yo'q: baza migratsiyasini orqaga qaytarish alohida tekshiruv
talab qiladi. Oldingi image, release va zaxira saqlanadi.

10 GB diskda image va zaxiralar uchun joy cheklangan. `df -h /`ni kuzating;
1 GiBdan kam joy qolsa, deploy builddan oldin to'xtaydi. Backup va eski imagelarni
saqlash muddatini belgilang. IP o'zgarsa, DEPLOY_HOST va tekshirilgan known_hosts
qiymatini ham yangilang.
