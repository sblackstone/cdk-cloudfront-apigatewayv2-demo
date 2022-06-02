import * as ApigwV2             from '@aws-cdk/aws-apigatewayv2-alpha';
import * as ApigwV2Integrations from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import { Construct } from 'constructs';
import * as path from 'path';

import { Stack,
         StackProps,
         Duration,
         aws_iam as IAM,
         aws_lambda as Lambda,
         aws_lambda_nodejs as LambdaNodejs,
         aws_cloudfront_origins as CloudfrontOrigins,
         aws_cloudfront as Cloudfront,
         aws_certificatemanager as CertificateManager,
         aws_route53 as Route53,
         aws_route53_targets as Targets53
} from 'aws-cdk-lib';

export class CdkCloudfrontApigatewayv2DemoStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const zoneDomainName = "fargle.com";
    const cfDomainName   = "cloudfront.fargle.com";

    const hostedZone = Route53.HostedZone.fromLookup(this, 'zone', { domainName: zoneDomainName });

    const certificate = new CertificateManager.DnsValidatedCertificate(this, 'cert', {
        domainName: `*.${zoneDomainName}`,
        subjectAlternativeNames: [ zoneDomainName ],
        hostedZone
    });

    const fn = new LambdaNodejs.NodejsFunction(this, `exampleFunction`, {
      runtime: Lambda.Runtime.NODEJS_14_X,
      entry: path.join(__dirname, '..', 'example.ts'),
      handler: "handler",
      description: `An example function`,
      depsLockFilePath: path.join(__dirname, `/../yarn.lock`)
    });


    const api = new ApigwV2.HttpApi(this, 'httpapi', {
      disableExecuteApiEndpoint: false,
      corsPreflight: {
        allowHeaders: ["origin", "access-control-request-method", "access-control-request-headers"],
        allowMethods: [ApigwV2.CorsHttpMethod.ANY],
        allowOrigins: ["*"],
      },
    });

    api.addRoutes({
      integration: new ApigwV2Integrations.HttpLambdaIntegration(`myFunction`, fn),
      path: '/example',
      methods: [ "POST" as ApigwV2.HttpMethod ],
    });

    const originRequestPolicy = new Cloudfront.OriginRequestPolicy(this, 'originRequestPolicy', {
      headerBehavior: Cloudfront.OriginRequestHeaderBehavior.allowList("access-control-request-method", "origin"),
      queryStringBehavior: Cloudfront.OriginRequestQueryStringBehavior.all()
    });

    const distribution = new Cloudfront.Distribution(this, 'cloudfront', {
      defaultBehavior: {
        origin: new CloudfrontOrigins.HttpOrigin(`${api.apiId}.execute-api.us-east-1.amazonaws.com`),
        originRequestPolicy,
        viewerProtocolPolicy: Cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: Cloudfront.AllowedMethods.ALLOW_ALL
      },
      certificate: certificate,
      domainNames: [ cfDomainName ]
    });

    new Route53.AaaaRecord(this, 'ipv6', {
      zone: hostedZone,
      recordName: cfDomainName,
      target: Route53.RecordTarget.fromAlias(new Targets53.CloudFrontTarget(distribution))
    });

    new Route53.ARecord(this, 'ipv4', {
      zone: hostedZone,
      recordName: cfDomainName,
      target: Route53.RecordTarget.fromAlias(new Targets53.CloudFrontTarget(distribution))
    });


  }
}
