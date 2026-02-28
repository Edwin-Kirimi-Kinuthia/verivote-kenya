declare module 'africastalking' {
  interface ATOptions {
    apiKey: string;
    username: string;
  }

  interface SMSSendParams {
    to: string[];
    message: string;
    from?: string;
  }

  interface SMSService {
    send(params: SMSSendParams): Promise<unknown>;
  }

  interface AfricasTalkingInstance {
    SMS: SMSService;
  }

  function AfricasTalking(options: ATOptions): AfricasTalkingInstance;
  export = AfricasTalking;
}
