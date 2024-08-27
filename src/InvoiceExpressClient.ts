import type { BaseHttpRequest } from "./core/BaseHttpRequest";
import type { OpenAPIConfig } from "./core/OpenAPI";
import { Interceptors } from "./core/OpenAPI";
import { FetchHttpRequest } from "./core/FetchHttpRequest";

import { ClientsService } from "./services.gen";
import { InvoicesService } from "./services.gen";
import { InvoicesReceiptsService } from "./services.gen";
import { SaftService } from "./services.gen";

type HttpRequestConstructor = new (config: OpenAPIConfig) => BaseHttpRequest;

export class InvoiceExpressClient {
  public readonly clients: ClientsService;
  public readonly invoices: InvoicesService;
  public readonly invoicesReceipts: InvoicesReceiptsService;
  public readonly saft: SaftService;

  public readonly request: BaseHttpRequest;

  constructor(
    config?: Partial<OpenAPIConfig>,
    HttpRequest: HttpRequestConstructor = FetchHttpRequest,
  ) {
    this.request = new HttpRequest({
      BASE: config?.BASE ?? "https://account_name.app.invoicexpress.com",
      VERSION: config?.VERSION ?? "1.0.0",
      WITH_CREDENTIALS: config?.WITH_CREDENTIALS ?? false,
      CREDENTIALS: config?.CREDENTIALS ?? "include",
      TOKEN: config?.TOKEN,
      USERNAME: config?.USERNAME,
      PASSWORD: config?.PASSWORD,
      HEADERS: config?.HEADERS,
      ENCODE_PATH: config?.ENCODE_PATH,
      interceptors: {
        request: config?.interceptors?.request ?? new Interceptors(),
        response: config?.interceptors?.response ?? new Interceptors(),
      },
    });

    this.clients = new ClientsService(this.request);
    this.invoices = new InvoicesService(this.request);
    this.invoicesReceipts = new InvoicesReceiptsService(this.request);
    this.saft = new SaftService(this.request);
  }
}
