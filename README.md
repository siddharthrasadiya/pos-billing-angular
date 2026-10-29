# POS Billing (Angular 22)

Billing, stock and Bluetooth receipt printing (58mm ESC/POS printer) for Chrome on Android and PC.
Data is stored on the device in IndexedDB.

## Node version

Angular 22 needs Node 22. This project carries its own Node 22 and npm 11 in `devDependencies`,
so `npm start` / `npm run build` use them even when the PC's default Node is 20.

First install (npm 10 has a bug with these packages, so use npm 11 once):

```bash
npx npm@11 install
```

## Run

```bash
npm start
```

Open http://localhost:4200. The **Web Print** button (receipt preview) shows only on localhost.

## Build for GitHub Pages

```bash
npm run build:gh
```

Deploy the `dist/pos-billing-angular/browser` folder. URLs use `#/` so page refresh works on GitHub Pages.

## Structure

```
src/app
├── core.index.ts                     barrel for core exports
├── core
│   ├── constants                     printer, db, demo data
│   ├── enums                         IndexedDB store names
│   ├── helpers                       receipt text, formatting, search, ids
│   ├── models                        shared interfaces (IBaseEntity: id, createdAt, updatedAt)
│   ├── service
│   │   ├── database.service.ts       the only place that talks to IndexedDB
│   │   ├── printer.service.ts        Web Bluetooth printing
│   │   ├── settings.service.ts       shop settings
│   │   └── ...
│   └── shared/receipt-preview        58mm on-screen preview
└── components
    ├── core-component.*              layout: header, tabs, toast
    ├── billing                       cart and print bill
    ├── product-management            products, add/edit form, categories
    ├── bill-history                  daily sales and profit
    └── settings                      shop name, address, GST
```

Components never touch IndexedDB. Each feature service (for example `ProductManagementService`)
returns Observables; to move to a live server later, change the service to call `HttpClient`
and the components stay the same.
