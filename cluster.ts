// Kubernetes Cluster Definition
// Martyn B <martyn@hey.com>
// Ref: https://github.com/pulumi/pulumi-civo/blob/master/examples/kubernetes/ts/minimal/index.ts
import * as k8s from "@pulumi/kubernetes";
import * as certmanager from "@pulumi/kubernetes-cert-manager";
import * as civo from "@pulumi/civo";

//  https://www.pulumi.com/registry/packages/civo/api-docs/firewall/
const baseNet = new civo.Network("baseNet", {label: "k3s-test-network"});
const firewall = new civo.Firewall("baseFirewall", {networkId: baseNet.id});

const DNSBase = "martynbristow.co.uk";
const DNSClusterPrefix = "test.apps";
const ClusterDNSName = `${DNSClusterPrefix}.${DNSBase}`
const dnsParent = civo.DnsDomainName.get(DNSBase, "d580f908-d3dd-4b1c-bf4a-5b08f199d45a")

const cluster = new civo.KubernetesCluster("martyn-test", {
    firewallId: firewall.id,
    pools: {
        size: "g2.medium",
        nodeCount: 2,
    },
    applications: "-traefik", // Disable default traefik
    tags: "demo, pulumi",
});

const k8sProvider = new k8s.Provider("martyn-civo-test", {
    kubeconfig: cluster.kubeconfig,
});

const clusterDnsEntry = new civo.DnsDomainRecord(ClusterDNSName, {
    "domainId": dnsParent.id,
    "ttl": 600,
    type: "CNAME",
    value: `${cluster.id}.k8s.civo.com`
});

// Traefik - Install via Helm
// https://github.com/civo/kubernetes-marketplace/blob/master/traefik2-nodeport/app.yaml

const traefikConfig = {
    hostNetwork: true,
    additionalArguments: "--providers.kubernetesingress.ingressendpoint.hostname=$CLUSTER_ID.k8s.civo.com",
    securityContext: {
        capabilities: {
            add: ["NET_BIND_SERVICE"]
        }
    },
    runAsNonRoot: false,
    runAsUser: 0,
    service: {
        enabled: false
    },
    deployment: {
        kind: "DaemonSet"
    },
    rbac: {
        enabled: true
    },
    ports: {
        websecure: {
            expose: true,
            exposePort: 443,
            port: 443,
            tls: {
                enabled: true
            },
        },
        web: {
            expose: true,
            exposePort: 80,
            port: 80
        },
    },
    podAnnotations: {
        "prometheus.io/port": "8082",
        "prometheus.io/scrape": true
    },
    providers: {
        kubernetesIngress: {
            publishedService: {
                enabled: true
            }
        }
    },
    priorityClassName: "system-cluster-critical",
    image: {
        name: "rancher/mirrored-library-traefik",
        tag: "2.9.4"
    },
    tolerations: [
        {
            "key": "CriticalAddonsOnly",
            "operator": "Exists"
        },
        {
            "key": "node-role.kubernetes.io/control-plane",
            "operator": "Exists",
            "effect": "NoSchedule"
        },
        {
            "key": "node-role.kubernetes.io/master",
            "operator": "Exists",
            "effect": "NoSchedule"
        }
    ],
    updateStrategy: {
      rollingUpdate: {
          maxUnavailable: 1,
          maxSurge: "0%"
      }
    }
}

const traefikNs = "traefik"
const traefikNamespace = new k8s.core.v1.Namespace(traefikNs);
const traefikChart = new k8s.helm.v3.Chart("traefik",
    {
        chart: "traefik",
        version: "20.2.1",
        namespace: traefikNs,
        values: traefikConfig,
        fetchOpts: {
            repo: "https://traefik.github.io/charts"
        }
    },
    {
        parent: this,
        dependsOn: [ traefikNamespace ]
    },
);

// Install cert-manager into our cluster.
const manager = new certmanager.CertManager("cert-manager", {
    installCRDs: true,
    helmOptions: {
        namespace: traefikNs,
    },
});

// Monitoring
const grafanaAppHostname = `grafana.${ClusterDNSName}`;
const monitoringNamespace = new k8s.core.v1.Namespace("monitoring");
const monitoringChart = new k8s.helm.v3.Chart("prometheus",
                                         {
                                             chart: "kube-prometheus-stack",
                                             version: "45.9.1",
                                             namespace: monitoringNamespace.id,
                                             values: {
                                                 alertmanager: {
                                                     enabled: false
                                                 },
                                                 grafana: {
                                                     ingress: "enabled",
                                                     ingressClassName: "traefik",
                                                     labels: {
                                                         app: "grafana",
                                                         group: "monitoring"
                                                     },
                                                     annotations: {
                                                         ingressClassName: "traefik",
                                                         "cert-manager.io/cluster-issuer": "letsencrypt-prod",
                                                         "traefik.ingress.kubernetes.io/router.entrypoints": "websecure",
                                                         "traefik.ingress.kubernetes.io/router.tls": "true"
                                                     },
                                                     hosts:
                                                     - grafanaAppHostname,
                                                     pathType: "ImplementationSpecific",
                                                     tls: [{
                                                         secretName: "grafana-tls",
                                                         hosts: [grafanaAppHostname]
                                                     }]
                                                 }
                                             },
                                             fetchOpts: {
                                                 repo: "https://prometheus-community.github.io/helm-charts"
                                             }
                                         },
                                         {
                                             parent: this,
                                             dependsOn: [ monitoringNamespace ]
                                         },
                                         );
const lokiChart = new k8s.helm.v3.Chart("loki",
    {
        chart: "loki-stack",
        version: "2.1.2",
        namespace: monitoringNamespace.id,
        values: {

        },
        fetchOpts: {
            repo: "https://grafana.github.io/loki/charts"
        }
    },
    {
        parent: this,
        dependsOn: [ monitoringNamespace ]
    },
);
// Required for Loki
const minioNamespace = new k8s.core.v1.Namespace("minio");
const minioChart = new k8s.helm.v3.Chart("minio",
    {
        chart: "minio",
        version: "",
        namespace: minioNamespace.id,
        values: {

        },
        fetchOpts: {
            repo: ""
        }
    },
    {
        parent: this,
        dependsOn: [ minioNamespace ]
    },
);

// Selenium
const seleniumAppHostname = `selenium.${ClusterDNSName}`;
const seleniumNamespace = new k8s.core.v1.Namespace("selenium");
const seleniumChart = new k8s.helm.v3.Chart("selenium",
    {
        chart: "selenium-grid",
        version: "4.10.0",
        namespace: seleniumNamespace.id,
        values: {
            isolateComponents: true
        },
        fetchOpts: {
            repo: "https://www.selenium.dev/docker-selenium"
        }
    },
    {
        parent: this,
        dependsOn: [ seleniumNamespace ]
    },
);
// https://github.com/SeleniumHQ/docker-selenium/blob/trunk/charts/selenium-grid/README.md
// CI
const jenkinsAppHostname = `jenkins.${ClusterDNSName}`;
const jenkinsNamespace = new k8s.core.v1.Namespace("jenkins");
const jenkinsChart = new k8s.helm.v3.Chart("jenkins",
    {
        chart: "jenkins",
        version: "4.5.0",
        namespace: jenkinsNamespace.id,
        values: {
            controller : {
                ingress: {
                    enabled: true,
                    apiVersion: "networking.k8s.io/v1",
                    labels: {
                        app: "jenkins"
                    },
                    annotations: {
                        "ingressClassName": "traefik",
                        "cert-manager.io/cluster-issuer": "letsencrypt-prod",
                        "traefik.ingress.kubernetes.io/router.entrypoints": "websecure",
                        "traefik.ingress.kubernetes.io/router.tls": "true"
                    },
                    hostName: jenkinsAppHostname,
                    tls: [{
                        secretName: "jenkins-tls",
                        hosts: [
                            jenkinsAppHostname
                        ]
                    }]
                },
                prometheus: {
                    enabled: true
                }
            }
        },
        fetchOpts: {
            repo: "https://charts.jenkins.io"
        }
    },
    {
        parent: this,
        dependsOn: [ jenkinsNamespace ]
    },
);
// https://www.jenkins.io/doc/book/installing/kubernetes/#install-jenkins-with-helm-v3

// Jager
const jagerAppHostname = `jager.${ClusterDNSName}`;
const jagerNamespace = new k8s.core.v1.Namespace("jager");
const jagerChart = new k8s.helm.v3.Chart("jager",
    {
        chart: "jager",
        version: "",
        namespace: jagerNamespace.id,
        values: {
            allInOne: {
                ingress: "enabled",
                hosts: jagerAppHostname,
                labels: {
                    app: "jager"
                },
                annotoations: {
                    ingressClassName: "traefik",
                    "kubernetes.io/ingress.class": "traefik",
                    "cert-manager.io/cluster-issuer": "letsencrypt-prod",
                    "traefik.ingress.kubernetes.io/router.entrypoints": "websecure",
                    "traefik.ingress.kubernetes.io/router.tls": "true"
                },
                tls: [{
                    secretName: "jager-tls",
                    hosts: [jagerAppHostname]
                }]

            }
        },
        fetchOpts: {
            repo: "https://jaegertracing.github.io/helm-charts"
        }
    },
    {
        parent: this,
        dependsOn: [ jagerNamespace ]
    },
);
export const clusterName = cluster.name;