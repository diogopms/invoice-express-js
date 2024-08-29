# invoice-express-js

## Build openapi spec

```bash
pnpm run generate; pnpm run build
```

## TODO

- [ ] Add tests
- [ ] Create a example folder
- [ ] Update README.md
- [ ] Add more operations
- [ ] Add request.config.interceptors.request.use

## Operations implemented

| API Section      | Operation                  | Status          |
|------------------|----------------------------|-----------------|
| **Invoices**     | Send by email              | ✅ |
|                  | Generate PDF               | Not Implemented |
|                  | Get                        | ✅ |
|                  | List all                   | ✅ |
|                  | Create                     | ✅ |
|                  | Update                     | Not Implemented |
|                  | Change-state               | ✅ |
|                  | Related documents          | Not Implemented |
|                  | Generate payment           | Not Implemented |
|                  | Cancel payment             | Not Implemented |
|                  | Get QR Code                | Not Implemented |
| **Estimates**    | Send by email              | Not Implemented |
|                  | Generate PDF               | Not Implemented |
|                  | Get                        | Not Implemented |
|                  | List all                   | Not Implemented |
|                  | Create                     | Not Implemented |
|                  | Update                     | Not Implemented |
|                  | Change-state               | Not Implemented |
| **Guides**       | Send by email              | Not Implemented |
|                  | Generate PDF               | Not Implemented |
|                  | Get                        | Not Implemented |
|                  | List all                   | Not Implemented |
|                  | Create                     | Not Implemented |
|                  | Update                     | Not Implemented |
|                  | Change-state               | Not Implemented |
|                  | Get QR Code                | Not Implemented |
| **Clients**      | List all                   | ✅ |
|                  | Get                        | ✅ |
|                  | Update                     | Not Implemented |
|                  | Create                     | ✅ |
|                  | Find by name               | ✅ |
|                  | Find by code               | ✅ |
| **Items**        | List all                   | ✅ |
|                  | Get                        | ✅ |
|                  | Update                     | Not Implemented |
|                  | Create                     | Not Implemented |
|                  | Delete                     | Not Implemented |
| **Sequences**    | Register                   | Not Implemented |
|                  | List all                   | Not Implemented |
|                  | Get                        | Not Implemented |
|                  | Update                     | Not Implemented |
|                  | Create                     | Not Implemented |
| **Taxes**        | List all                   | ✅ |
|                  | Get                        | ✅ |
|                  | Update                     | Not Implemented |
|                  | Create                     | Not Implemented |
|                  | Delete                     | Not Implemented |
| **Accounts**     | Get                        | Not Implemented |
|                  | Update                     | Not Implemented |
|                  | Create                     | Not Implemented |
|                  | Create for existing user   | Not Implemented |
|                  | At Communication           | Not Implemented |
| **SAFT**         | Export SAFT                | ✅ |
| **Treasury**     | Get client balance         | Not Implemented |
|                  | Update initial balance     | Not Implemented |
|                  | Get regularization         | Not Implemented |
|                  | Create regularization      | Not Implemented |
|                  | Delete regularization      | Not Implemented |
|                  | Create treasury movement   | Not Implemented |
|                  | Delete treasury movement   | Not Implemented |
