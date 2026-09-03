import { APIContracts, APIControllers, Constants as SDKConstants } from 'authorizenet';

export type PaymentType = 'credit' | 'debit' | 'ach';

export function authorizeNetConfigured(): boolean {
  return Boolean(process.env.AUTHORIZE_NET_API_LOGIN_ID && process.env.AUTHORIZE_NET_API_TRANSACTION_KEY);
}

export function authorizeNetSandbox(): boolean {
  const endpoint = process.env.AUTHORIZE_NET_API_ENDPOINT || '';
  return (
    process.env.APP_MODE === 'development' ||
    endpoint.includes('apitest') ||
    process.env.NODE_ENV !== 'production'
  );
}

export function acceptJsPublicConfig() {
  return {
    loginId: process.env.AUTHORIZE_NET_API_LOGIN_ID || process.env.NEXT_PUBLIC_AUTHORIZE_NET_API_LOGIN_ID || '',
    clientKey: process.env.NEXT_PUBLIC_AUTHORIZE_NET_PUBLIC_CLIENT_KEY || process.env.AUTHORIZE_NET_PUBLIC_CLIENT_KEY || '',
    sandbox: authorizeNetSandbox(),
    acceptJsUrl: authorizeNetSandbox()
      ? 'https://jstest.authorize.net/v1/Accept.js'
      : 'https://js.authorize.net/v1/Accept.js',
  };
}

function merchantAuth() {
  const login = process.env.AUTHORIZE_NET_API_LOGIN_ID;
  const key = process.env.AUTHORIZE_NET_API_TRANSACTION_KEY;
  if (!login || !key) throw new Error('Authorize.net is not configured');
  const auth = new APIContracts.MerchantAuthenticationType();
  auth.setName(login);
  auth.setTransactionKey(key);
  return auth;
}

function setEnv(controller: { setEnvironment: (e: string) => void }) {
  controller.setEnvironment(authorizeNetSandbox() ? SDKConstants.endpoint.sandbox : SDKConstants.endpoint.production);
}

function execute<T>(
  Controller: new (json: unknown) => { setEnvironment: (e: string) => void; execute: (cb: () => void) => void; getResponse: () => unknown },
  request: { getJSON: () => unknown },
  wrap: (api: unknown) => T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const ctrl = new Controller(request.getJSON());
    setEnv(ctrl);
    ctrl.execute(() => {
      try {
        const api = ctrl.getResponse();
        if (!api) {
          reject(new Error('No response from Authorize.net'));
          return;
        }
        resolve(wrap(api));
      } catch (err) {
        reject(err);
      }
    });
  });
}

function resultOk(response: { getMessages: () => { getResultCode: () => string; getMessage: () => { getText: () => string; getCode: () => string }[] } }): boolean {
  return response.getMessages()?.getResultCode() === APIContracts.MessageTypeEnum.OK;
}

function resultError(response: { getMessages: () => { getMessage: () => { getText: () => string; getCode: () => string }[] } }): string {
  const msg = response.getMessages()?.getMessage()?.[0];
  const text = msg?.getText() || 'Authorize.net error';
  const code = msg?.getCode();
  return code ? `${text} (${code})` : text;
}

export async function createCustomerProfile(opts: { merchantCustomerId: string; email: string; description: string }): Promise<string> {
  const profile = new APIContracts.CustomerProfileType();
  profile.setMerchantCustomerId(opts.merchantCustomerId);
  profile.setEmail(opts.email);
  profile.setDescription(opts.description);
  const req = new APIContracts.CreateCustomerProfileRequest();
  req.setMerchantAuthentication(merchantAuth());
  req.setProfile(profile);
  return execute(APIControllers.CreateCustomerProfileController, req, (api) => {
    const res = new APIContracts.CreateCustomerProfileResponse(api);
    if (!resultOk(res)) throw new Error(resultError(res));
    const id = res.getCustomerProfileId();
    if (!id) throw new Error('Authorize.net did not return a customer profile id');
    return id;
  });
}

export async function createPaymentProfile(opts: {
  customerProfileId: string;
  dataDescriptor: string;
  dataValue: string;
  billing: {
    firstName: string;
    lastName: string;
    company?: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phoneNumber?: string;
  };
}): Promise<string> {
  const opaque = new APIContracts.OpaqueDataType();
  opaque.setDataDescriptor(opts.dataDescriptor);
  opaque.setDataValue(opts.dataValue);
  const payment = new APIContracts.PaymentType();
  payment.setOpaqueData(opaque);

  const address = new APIContracts.CustomerAddressType();
  address.setFirstName(opts.billing.firstName);
  address.setLastName(opts.billing.lastName);
  if (opts.billing.company) address.setCompany(opts.billing.company);
  address.setAddress(opts.billing.address);
  address.setCity(opts.billing.city);
  address.setState(opts.billing.state);
  address.setZip(opts.billing.zip);
  address.setCountry(opts.billing.country);
  if (opts.billing.phoneNumber) address.setPhoneNumber(opts.billing.phoneNumber);

  const profile = new APIContracts.CustomerPaymentProfileType();
  profile.setCustomerType(APIContracts.CustomerTypeEnum.INDIVIDUAL);
  profile.setPayment(payment);
  profile.setBillTo(address);

  const req = new APIContracts.CreateCustomerPaymentProfileRequest();
  req.setMerchantAuthentication(merchantAuth());
  req.setCustomerProfileId(opts.customerProfileId);
  req.setPaymentProfile(profile);
  req.setValidationMode(APIContracts.ValidationModeEnum.LIVEMODE);

  return execute(APIControllers.CreateCustomerPaymentProfileController, req, (api) => {
    const res = new APIContracts.CreateCustomerPaymentProfileResponse(api);
    if (!resultOk(res)) throw new Error(resultError(res));
    const id = res.getCustomerPaymentProfileId();
    if (!id) throw new Error('Authorize.net did not return a payment profile id');
    return id;
  });
}

export async function getPaymentProfileDetails(customerProfileId: string, paymentProfileId: string): Promise<{ paymentType: PaymentType; description: string }> {
  const req = new APIContracts.GetCustomerPaymentProfileRequest();
  req.setMerchantAuthentication(merchantAuth());
  req.setCustomerProfileId(customerProfileId);
  req.setCustomerPaymentProfileId(paymentProfileId);
  return execute(APIControllers.GetCustomerPaymentProfileController, req, (api) => {
    const res = new APIContracts.GetCustomerPaymentProfileResponse(api);
    if (!resultOk(res)) return { paymentType: 'credit' as const, description: 'Card' };
    const payment = res.getPaymentProfile()?.getPayment();
    if (payment?.getBankAccount()) {
      return { paymentType: 'ach', description: `${payment.getBankAccount().getBankName() || 'Bank'} ACH` };
    }
    if (payment?.getCreditCard()) {
      const card = payment.getCreditCard();
      const typeName = card.getCardType() || 'Card';
      const last4 = (card.getCardNumber() || '').slice(-4);
      const debit = String(typeName).toLowerCase().includes('debit');
      return { paymentType: debit ? 'debit' : 'credit', description: `${typeName} ${last4}`.trim() };
    }
    return { paymentType: 'credit', description: 'Card' };
  });
}

export async function deletePaymentProfile(customerProfileId: string, paymentProfileId: string): Promise<void> {
  const req = new APIContracts.DeleteCustomerPaymentProfileRequest();
  req.setMerchantAuthentication(merchantAuth());
  req.setCustomerProfileId(customerProfileId);
  req.setCustomerPaymentProfileId(paymentProfileId);
  await execute(APIControllers.DeleteCustomerPaymentProfileController, req, (api) => {
    const res = new APIContracts.DeleteCustomerPaymentProfileResponse(api);
    if (!resultOk(res)) throw new Error(resultError(res));
    return true;
  });
}

export async function chargeProfile(opts: {
  customerProfileId: string;
  customerPaymentProfileId: string;
  amount: string;
  invoiceNumber: string;
  description: string;
}): Promise<string> {
  const txn = new APIContracts.TransactionRequestType();
  txn.setTransactionType(APIContracts.TransactionTypeEnum.AUTHCAPTURETRANSACTION);
  txn.setAmount(opts.amount);
  const profile = new APIContracts.CustomerProfilePaymentType();
  profile.setCustomerProfileId(opts.customerProfileId);
  const paymentProfile = new APIContracts.PaymentProfile();
  paymentProfile.setPaymentProfileId(opts.customerPaymentProfileId);
  profile.setPaymentProfile(paymentProfile);
  txn.setProfile(profile);
  const order = new APIContracts.OrderType();
  order.setInvoiceNumber(opts.invoiceNumber);
  order.setDescription(opts.description);
  txn.setOrder(order);
  const req = new APIContracts.CreateTransactionRequest();
  req.setMerchantAuthentication(merchantAuth());
  req.setTransactionRequest(txn);
  return execute(APIControllers.CreateTransactionController, req, (api) => {
    const res = new APIContracts.CreateTransactionResponse(api);
    if (!resultOk(res)) throw new Error(resultError(res));
    const txnRes = res.getTransactionResponse();
    if (!txnRes) throw new Error('No transaction response');
    if (txnRes.getResponseCode() !== '1') {
      const err = txnRes.getErrors()?.getError()?.[0]?.getErrorText();
      throw new Error(err || 'Transaction was declined');
    }
    const id = txnRes.getTransId();
    if (!id) throw new Error('No transaction id');
    return id;
  });
}

export async function createArbSubscription(opts: {
  customerProfileId: string;
  customerPaymentProfileId: string;
  amount: string;
  description: string;
  invoiceNumber: string;
  startDate: string;
}): Promise<string> {
  const subscription = new APIContracts.ARBSubscriptionType();
  subscription.setName(opts.description);
  subscription.setAmount(opts.amount);
  const schedule = new APIContracts.PaymentScheduleType();
  const interval = new APIContracts.PaymentScheduleType.Interval();
  interval.setLength(1);
  interval.setUnit(APIContracts.ARBSubscriptionUnitEnum.MONTHS);
  schedule.setInterval(interval);
  schedule.setStartDate(opts.startDate);
  schedule.setTotalOccurrences(9999);
  subscription.setPaymentSchedule(schedule);
  const order = new APIContracts.OrderType();
  order.setInvoiceNumber(opts.invoiceNumber);
  order.setDescription(opts.description);
  subscription.setOrder(order);
  const profile = new APIContracts.CustomerProfilePaymentType();
  profile.setCustomerProfileId(opts.customerProfileId);
  const paymentProfile = new APIContracts.PaymentProfile();
  paymentProfile.setPaymentProfileId(opts.customerPaymentProfileId);
  profile.setPaymentProfile(paymentProfile);
  subscription.setProfile(profile);
  const req = new APIContracts.ARBCreateSubscriptionRequest();
  req.setMerchantAuthentication(merchantAuth());
  req.setSubscription(subscription);
  const json = JSON.parse(JSON.stringify(req.getJSON()));
  if (json.ARBCreateSubscriptionRequest?.subscription?.profile?.paymentProfile) {
    json.ARBCreateSubscriptionRequest.subscription.profile.customerPaymentProfileId = opts.customerPaymentProfileId;
    delete json.ARBCreateSubscriptionRequest.subscription.profile.paymentProfile;
  }
  return new Promise((resolve, reject) => {
    const ctrl = new APIControllers.ARBCreateSubscriptionController(json);
    setEnv(ctrl);
    ctrl.execute(() => {
      try {
        const api = ctrl.getResponse();
        if (!api) {
          reject(new Error('No response from Authorize.net'));
          return;
        }
        const res = new APIContracts.ARBCreateSubscriptionResponse(api);
        if (!resultOk(res)) {
          reject(new Error(resultError(res)));
          return;
        }
        const id = res.getSubscriptionId();
        if (!id) {
          reject(new Error('No ARB subscription id'));
          return;
        }
        resolve(id);
      } catch (err) {
        reject(err);
      }
    });
  });
}

export async function cancelArbSubscription(adnSubscriptionId: string): Promise<void> {
  const req = new APIContracts.ARBCancelSubscriptionRequest();
  req.setMerchantAuthentication(merchantAuth());
  req.setSubscriptionId(adnSubscriptionId);
  await execute(APIControllers.ARBCancelSubscriptionController, req, (api) => {
    const res = new APIContracts.ARBCancelSubscriptionResponse(api);
    if (!resultOk(res)) throw new Error(resultError(res));
    return true;
  });
}
