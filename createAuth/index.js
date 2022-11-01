module.exports = async function (context, req) {
  require("dotenv").config();
  const axios = require("axios");

  // Define needed variables
  apiId = "";
  teamId = "";

  //Rapid GraphQL PAPI Settings
  const gHost = process.env.GQL_HOST;
  const gUrl = process.env.GQL_URL;
  const gRapidKey = process.env.GQL_RAPID_KEY;

  //Azure Settings
  const azureServiceGateway = process.env.AZURE_SERVICE_GATEWAY;
  const azureGatewayName = azureServiceGateway.toLowerCase();
  const azureBaseUrl =
    "https://" + azureGatewayName + ".management.azure-api.net";
  const azureResourceGroup = process.env.AZURE_RESOURCE_GROUP;
  const azureProvider = process.env.AZURE_PROVIDER_NAME;
  const azureAPIversion = process.env.AZURE_API_VERSION;
  const azureOauth2Service = process.env.AZURE_OAUTH2_SERVICE;

  //Azure Subscription Details
  const azureSubscription = process.env.AZURE_SUBSCRIPTION;
  const azureSharedAccessKey = process.env.AZURE_SHARED_ACCESS_KEY;

  //Azure Gateway API Endpoints
  const azureGetClientIdURL = `${azureBaseUrl}/subscriptions/${azureSubscription}/resourceGroups/${azureResourceGroup}/providers/${azureProvider}/service/${azureServiceGateway}/authorizationServers/${azureOauth2Service}`;
  const azureGetClientSecretURL = `${azureBaseUrl}/subscriptions/${azureSubscription}/resourceGroups/${azureResourceGroup}/providers/${azureProvider}/service/${azureServiceGateway}/authorizationServers/${azureOauth2Service}/listSecrets`;

  // Show the web hook event type from Rapid
  console.log("eventType is: ", req.body.type);

  // Get teamId, apiId, from SUBSCRIPTION.CREATED webhook
  function getSubDetail() {
    if (!req.body || req.body.type !== "SUBSCRIPTION.UPDATED") {
      console.log("Skipping Event: ", req.body.type);
      return context.res.status(400);
    }
    teamId = req.body.data[0].userId;
    apiId = req.body.data[0].apiId;
    return apiId, teamId;
  }

  // Call the GraphQL PAPI to get the slugifiedName and gatewayIds
  async function getApiDetails(apiId) {
    //Operating variables
    let sName = "",
      gIds = "";

    //Build API call
    const getApiDetails = {
      method: "POST",
      url: gUrl,
      headers: {
        "content-type": "application/json",
        "X-RapidAPI-Key": gRapidKey,
        "X-RapidAPI-Host": gHost,
      },
      data: {
        query: `query api($id: ID!) {\n  api(id: $id) {\n    id\n    name\n    slugifiedName\n    gatewayIds\n            \n    }\n  }`,
        variables: { id: apiId },
      },
    };

    //Call API
    await axios
      .request(getApiDetails)
      .then(function (response) {
        //Assignment from response data
        sName = response.data.data.api.slugifiedName;
        gIds = response.data.data.api.gatewayIds[0];
        userId = teamId;
      })
      .catch(function (error) {
        console.error(error);
      });

    // process return
    return [sName, gIds];
  }

  // Call the GraphQL PAPI to get the ProjectId
  async function getProject(teamId) {
    //Operating variables
    let pId = "";

    //Build API call
    const getProject = {
      method: "POST",
      url: gUrl,
      headers: {
        "content-type": "application/json",
        "X-RapidAPI-Key": gRapidKey,
        "X-RapidAPI-Host": gHost,
      },
      data: {
        query: `query team($id: ID!) {\n      team(id: $id) {\n        id\n        name\n        ProjectAcls {\n          id\n          Project {\n            id\n            name\n          }\n        }\n      }\n}\n    `,
        variables: { id: teamId },
      },
    };

    //Call API
    await axios
      .request(getProject)
      .then(function (response) {
        // Assignment from response data
        pId = response.data.data.team.ProjectAcls[0].Project.id;
      })
      .catch(function (error) {
        console.error(error);
      });

    // process return
    return pId;
  }

  // Call to Azure to get the clientId
  async function getClientId() {
    //Operating variables

    //Build API call
    await axios({
      method: "GET",
      url: azureGetClientIdURL,
      params: {
        "api-version": azureAPIversion,
      },
      headers: {
        Authorization: azureSharedAccessKey,
        "Content-Type": "application/json; charset=utf-8",
      },
    })
      .then((response) => {
        clientId = response.data.properties.clientId;
        // console.log("\n\n\nclientId is : ", clientId);
      })
      .catch((err) => {
        console.error(err);
      });
    // process return
    return clientId;
  }

  async function getClientSecret() {
    //Operating variables

    //Build API call
    await axios({
      method: "POST",
      url: azureGetClientSecretURL,
      params: {
        "api-version": azureAPIversion,
      },
      headers: {
        Authorization: azureSharedAccessKey,
        "Content-Type": "application/json; charset=utf-8",
      },
    })
      .then((response) => {
        clientSecret = response.data.clientSecret;
        // console.log("\n\n\nclientSecret is : ", clientSecret);
      })
      .catch((err) => {
        console.error(err);
      });
    // process return
    return clientSecret;
  }

  // Call to create the Authorization in Rapid
  function createAuth() {
    // Set the variables in the call
    const PROJECTID = ProjectId; // this is the app id
    const AUTHNAME = "Auth" + ProjectId;
    const CLIENTID = clientId;
    const CLIENTSECRET = clientSecret;
    const GATEWAYIDARRAY = [gatewayIds]; // keep the brackets - it is a single value array
    const GRANTTYPE = "CLIENT_CREDENTIALS"; // This is a hard-coded value

    const options = {
      method: "POST",
      url: gUrl,
      headers: {
        "content-type": "application/json",
        "X-RapidAPI-Key": gRapidKey,
        "X-RapidAPI-Host": gHost,
        "x-rapidapi-identity-key": "",
      },
      data: {
        query: `mutation createApplicationAuthorization($input: AppAuthorizationCreateInput!) {
  createApplicationAuthorization(input: $input) {
    id
    name
    applicationId
    status
    createdAt
    authorizationType
    authorizationValues
  }
}`,
        variables: {
          input: {
            projectId: PROJECTID,
            name: AUTHNAME,
            authorizationType: "OAUTH2",
            authorizationValues:
              '{"clientId":"' +
              CLIENTID +
              '","clientSecret":"' +
              CLIENTSECRET +
              '"}',
            gatewayIds: GATEWAYIDARRAY,
            grantType: GRANTTYPE,
          },
        },
      },
    };

    //Call API
    axios
      .request(options)
      .then(function (response) {
        console.log(JSON.stringify(response.data));
        console.log("Status: ", JSON.stringify(response.status));
      })
      .catch(function (error) {
        console.error(error);
      });
  }

  async function main() {
    try {
      console.log(
        "**************************\n*  Create Authorization  *\n**************************\n"
      );
      // Get API Listing From Gateway and extract names
      apiId, (teamId = await getSubDetail());
      console.log("main apiId : ", apiId);
      console.log("main teamId : ", teamId);

      // Get SPI Details and return slugifiedName, gatewayIds
      [slugifiedName, gatewayIds] = await getApiDetails(apiId);
      console.log("\nmain slugifiedName is : ", slugifiedName);
      console.log("main gatewayIds is : ", gatewayIds);

      // Get the Project Id
      ProjectId = await getProject(userId);
      console.log("\nmain ProjectId is : ", ProjectId);

      // Get the clientId
      clientId = await getClientId(userId);
      console.log("\nmain clientId is : ", clientId);

      // Get the clientSecret
      clientSecret = await getClientSecret(userId);
      console.log("\nmain clientSecret is : ", clientSecret);

      // Create Authorization
      createAuth();
      console.log(
        "***************************\n*  Authorization Results  *\n***************************\n"
      );
    } catch (err) {
      console.log(err);
    }
  }

  main();
};
