import MockDate from 'mockdate';
import { INestApplication } from '@nestjs/common';
import { ServerSDK, SessionResource } from '@mtm/server-sdk';
import { bootstrapServer } from '../server';
import { Err, Ok } from 'ts-results';
import { AsyncOk, AsyncResult } from 'ts-async-results';

// This depends on the server and it's more of an e2e test, so I'll leave it here
// for now! Until further ado! The server-sdk lib can be tested by itself w/o
// depending on the server actually – with everything mocked

// let mockUUIDCount = 0;
// const get_MOCKED_UUID = (count: number) => `MOCK-UUID-${count}`;
// jest.mock('uuid', () => ({ v4: () => get_MOCKED_UUID(++mockUUIDCount) }));

// const delay = (ms = 500) =>
//   new Promise((resolve) => {
//     setTimeout(resolve, ms);
//   });

// describe('My Remote Server', () => {
let server: INestApplication;
let sdk: ServerSDK<
  {
    username: string;
    age: number;
  },
  {
    room: {
      id: string;
      type: 'play' | 'analysis' | 'meetup';
    };
    game: {
      id: string;
      type: 'maha' | 'chess';
    };
  }
>;

const NOW_TIMESTAMP = new Date().getTime();

const noop = () => {};

const silentLogger = {
  ...console,
  info: noop,
  log: noop,
  warn: noop,
  error: noop,
} as any;

beforeAll((done) => {
  // Date
  MockDate.set(NOW_TIMESTAMP);

  bootstrapServer().then((startedServer) => {
    server = startedServer;
    done();
  });
});

afterAll((done) => {
  MockDate.reset();

  server.close().then(() => done());
});

beforeEach((done) => {
  sdk = new ServerSDK({
    url: 'ws://localhost:4444',
    apiKey: 'tester-A',
    logger: silentLogger,
  });

  sdk.connect().then(() => done());
});

afterEach((done) => {
  sdk.disconnect();
  done();
});

describe('Clients', () => {
  it('sends a "createClient" Request and gets a Response back succesfully', async () => {
    await sdk
      .createClient()
      .map((actual) => {
        expect(actual).toEqual({
          id: actual.id,
          subscriptions: {},
        });
      })
      .resolve();
  });

  it('sends a "createClient" Request with given id and params and gets a Response back succesfully', async () => {
    await sdk
      .createClient({
        id: 'client-1',
        info: {
          username: 'tester',
          age: 23,
        },
      })
      .map((actual) => {
        expect(actual).toEqual({
          id: 'client-1',
          info: {
            username: 'tester',
            age: 23,
          },
          subscriptions: {},
        });
      })
      .resolve();
  });

  it('gets a Client', async () => {
    await sdk
      .createClient({
        id: 'client-1',
        info: {
          username: 'tester',
          age: 23,
        },
      })
      .flatMap(() => sdk.getClient('client-1'))
      .map((actual) => {
        expect(actual).toEqual({
          id: 'client-1',
          info: {
            age: 23,
            username: 'tester',
          },
          subscriptions: {},
        });
      })
      .resolve();
  });

  it('removes a Client', async () => {
    const clientId = 'client-for-removal';
    await sdk
      .createClient({
        id: clientId,
        info: {
          username: 'tester',
          age: 23,
        },
      })
      .resolve();

    await sdk
      .getClient(clientId)
      .resolve()
      .then((actual) => {
        // console.debug('actual.val', actual.val);
        expect(actual.val).toEqual({
          id: clientId,
          info: {
            age: 23,
            username: 'tester',
          },
          subscriptions: {},
        });
      });

    const actualRemoval = await sdk.removeClient(clientId).resolve();
    const actualRetrieval = await sdk.getClient(clientId).resolve();

    // console.debug('actualRetrieval', actualRetrieval);

    expect(actualRetrieval.val).toEqual({
      kind: 'ServerSDKError',
      reason: 'CollectionFieldInexistent',
    });

    expect(actualRemoval).toEqual(
      new Ok({
        id: clientId,
        subscriptions: {},
      })
    );
  });
});

describe('Resources', () => {
  it('sends a "createResource" Request and gets a Response back succesfully', async () => {
    await sdk
      .createResource({ resourceType: 'room', resourceData: { type: 'play' } })
      .map((actual) => {
        expect(actual).toEqual({
          type: 'room',
          item: {
            id: actual.item.id,
            type: 'play',
          },
          subscribers: {},
        });
      })
      .resolve();
  });

  describe('Read & Update ', () => {
    it('gets a Resource', async () => {
      await sdk
        .createResource({
          resourceType: 'room',
          resourceData: { type: 'play' },
        })
        .flatMap((createdResource) =>
          AsyncResult.all(
            new AsyncOk(createdResource),
            sdk.getResource({
              resourceId: createdResource.item.id,
              resourceType: 'room',
            })
          )
        )
        .map(([createdResource, actual]) => {
          expect(actual).toEqual({
            type: 'room',
            item: {
              id: createdResource.item.id,
              type: 'play',
            },
            subscribers: {},
          });
        })
        .resolve();
    });

    it('gets a Resource and adds a flatmap to it', async () => {
      await sdk
        .createResource({
          resourceType: 'room',
          resourceData: { type: 'play' },
          resourceId: 'tr1',
        })
        .flatMap((createdResource) =>
          sdk.getResource({
            resourceId: createdResource.item.id,
            resourceType: 'room',
          })
        )
        .map((resource) => {
          expect(resource).toEqual({
            type: 'room',
            item: { id: 'tr1', type: 'play' },
            subscribers: {},
          });
        })
        .resolve();
    });

    it('Updates a Resource', async () => {
      await sdk
        .createResource({
          resourceType: 'room',
          resourceData: { type: 'play' },
        })
        .flatMap((resource) =>
          sdk.updateResource(
            {
              resourceId: resource.item.id,
              resourceType: 'room',
            },
            {
              type: 'meetup',
            }
          )
        )
        .map((actual) => {
          expect(actual).toEqual({
            type: 'room',
            item: {
              id: actual.item.id,
              type: 'meetup',
            },
            subscribers: {},
          });
        })
        .resolve();
    });

    it('Updates a Resource with subscribers', async () => {
      await AsyncResult.all(
        sdk.createResource({
          resourceType: 'room',
          resourceData: { type: 'play' },
        }),
        sdk.createClient({
          id: 'user-1',
          info: { age: 23, username: 'tester-1' },
        })
      )
        .flatMap(([resource, client]) =>
          AsyncResult.all(
            new AsyncOk(resource),
            new AsyncOk(client),
            sdk.subscribeToResource(client.id, {
              resourceId: resource.item.id,
              resourceType: 'room',
            })
          )
        )
        .map(
          AsyncResult.passThrough(([resource, client, subscriptionRes]) => {
            expect(subscriptionRes).toEqual({
              client: {
                ...client,
                subscriptions: {
                  [`room:${resource.item.id}`]: {
                    subscribedAt: NOW_TIMESTAMP,
                  },
                },
              },
              resource: {
                ...resource,
                subscribers: {
                  [client.id]: {
                    subscribedAt: NOW_TIMESTAMP,
                  },
                },
              },
            });
          })
        )
        .flatMap(([resource, client]) =>
          AsyncResult.all(
            sdk.updateResource(
              {
                resourceId: resource.item.id,
                resourceType: 'room',
              },
              {
                type: 'meetup',
              }
            ),
            new AsyncOk(client)
          )
        )
        .map(
          AsyncResult.passThrough(([updatedResource, client]) => {
            expect(updatedResource).toEqual({
              type: 'room',
              item: {
                id: updatedResource.item.id,
                type: 'meetup',
              },
              subscribers: {
                [client.id]: {
                  subscribedAt: NOW_TIMESTAMP,
                },
              },
            });
          })
        )
        .resolve();
    });
  });

  describe('Removal', () => {
    it('removes a resource', async () => {
      await sdk
        .createResource({
          resourceType: 'room',
          resourceData: {
            type: 'meetup',
          },
        })
        .flatMap((resource) =>
          AsyncResult.all(
            new AsyncOk(resource),
            sdk.removeResource({
              resourceId: resource.item.id,
              resourceType: 'room',
            })
          )
        )
        .map(([prevResource, actual]) => {
          expect(actual).toEqual({
            resourceId: prevResource.item.id,
            resourceType: 'room',
            subscribers: {},
          });
        })
        .resolve();
    });
  });
});

describe('Subscriptions', () => {
  it('subscribes a $client to a resource', async () => {
    await AsyncResult.all(
      sdk.createResource({
        resourceType: 'room',
        resourceData: { type: 'play' },
      }),
      sdk.createClient({
        id: 'user-1',
        info: { age: 23, username: 'tester-1' },
      })
    )
      .flatMap(([resource, client]) =>
        AsyncResult.all(
          new AsyncOk(resource),
          new AsyncOk(client),
          sdk.subscribeToResource('user-1', {
            resourceId: resource.item.id,
            resourceType: 'room',
          })
        )
      )
      .map(([resource, client, subscription]) => {
        expect(subscription).toEqual({
          client: {
            ...client,
            subscriptions: {
              [`room:${resource.item.id}`]: {
                subscribedAt: NOW_TIMESTAMP,
              },
            },
          },
          resource: {
            ...resource,
            subscribers: {
              [client.id]: {
                subscribedAt: NOW_TIMESTAMP,
              },
            },
          },
        });
      })
      .resolve();
  });

  it('unsubscribes a $client from a resource', async () => {
    await AsyncResult.all(
      sdk.createResource({
        resourceType: 'room',
        resourceData: { type: 'play' },
      }),
      sdk.createClient({
        id: 'user-1',
        info: { age: 23, username: 'tester-1' },
      })
    )
      .flatMap(([resource, client]) =>
        sdk.subscribeToResource(client.id, {
          resourceId: resource.item.id,
          resourceType: 'room',
        })
      )
      .flatMap(({ resource, client }) =>
        AsyncResult.all(
          ...[resource, client].map((a) => new AsyncOk(a)),
          sdk.unsubscribeFromResource(client.id, {
            resourceId: resource.item.id,
            resourceType: 'room',
          })
        )
      )
      .map(([resource, client, unsubscriptionResult]) => {
        expect(unsubscriptionResult).toEqual({
          resource: {
            ...resource,
            subscribers: {},
          },
          client: {
            ...client,
            subscriptions: {},
          },
        });
      })
      .resolve();
  });

  it('removes a resource with subscribers', async () => {
    await AsyncResult.all(
      sdk.createResource({
        resourceType: 'room',
        resourceData: { type: 'play' },
      }),
      sdk.createClient({
        id: 'user-1',
        info: { age: 23, username: 'tester-1' },
      })
    )
      .flatMap(([resource, client]) =>
        sdk.subscribeToResource(client.id, {
          resourceId: resource.item.id,
          resourceType: 'room',
        })
      )
      .flatMap(({ resource }) =>
        sdk.removeResource({
          resourceId: resource.item.id,
          resourceType: 'room',
        })
      )
      .map((actual) => {
        expect(1).toBe(2);
        // TOOD: Fix this type!!!
        // expect(actual).toEqual({
        //   resourceId: actual.resourceId,
        //   resourceType: 'room',
        //   subscribers: {
        //     'user-1': {
        //       subscribedAt: NOW_TIMESTAMP,
        //     },
        //   },
        // });
      })
      .resolve();
  });
});

// describe('Events', () => {
//   it('listens to resource updates', async () => [
//     sdk.onResourceUpdated('game', (p) => {}),
//   ]);
// });
// });

// TODO: To add
// describe('multiple connections', () => {
//   let server: INestApplication;
//   let sdkA: SessionSDK;
//   let sdkB: SessionSDK;
//   let sdkC: SessionSDK;

//   beforeEach((done) => {
//     bootstrapServer().then((startedServer) => {
//       server = startedServer;

//       sdkA = new SessionSDK({
//         url: 'ws://localhost:4444',
//         apiKey: 'tester-A',
//       });

//       sdkB = new SessionSDK({
//         url: 'ws://localhost:4444',
//         apiKey: 'tester-B',
//       });

//       sdkC = new SessionSDK({
//         url: 'ws://localhost:4444',
//         apiKey: 'tester-C',
//       });

//       Promise.all([sdkA.connect(), sdkB.connect(), sdkC.connect()]).then(
//         (socket) => {
//           // console.log('connected', socket.id);
//           done();
//         }
//       );

//       // sdkB.connect();

//       // ();
//     });
//   });

//   afterEach((done) => {
//     server.close().then(done);

//     sdkA.disconnect();
//     sdkB.disconnect();
//     sdkC.disconnect();
//   });
// });
