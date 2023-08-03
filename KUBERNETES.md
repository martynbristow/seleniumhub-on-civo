# Pulumi Kubernetes

Install both `@pulumi/kubernetes` and the module for your providor e.g. `@pulumi/civo`

Make sure in your config the provider in the kubernetes context, is linked to the cluster created or imported.

Otherwise pulumi will link your cluster to what is in the `KUBECONFIG` variable.