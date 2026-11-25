<?php

declare(strict_types=1);

namespace Lmp\LicenseManager\Controller\Storefront;

use Lmp\LicenseManager\Service\LicenseService;
use Shopware\Core\System\SalesChannel\SalesChannelContext;
use Shopware\Storefront\Controller\StorefrontController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

/**
 * Customer account page listing the logged-in customer's licenses.
 * Route: GET /account/licenses
 */
class LicensesController extends StorefrontController
{
    private LicenseService $licenseService;

    public function __construct(LicenseService $licenseService)
    {
        $this->licenseService = $licenseService;
    }

    #[Route(
        path: '/account/licenses',
        name: 'frontend.account.lmp.licenses',
        methods: ['GET'],
        defaults: ['_routeScope' => ['storefront']]
    )]
    public function licenses(SalesChannelContext $context): Response
    {
        $customer = $context->getCustomer();
        if ($customer === null) {
            return $this->redirectToRoute('frontend.account.login.page');
        }

        $email = (string) $customer->getEmail();
        $licenses = $this->licenseService->findLicensesByEmail($email);

        return $this->renderStorefront('@LmpLicenseManager/storefront/page/account/licenses.html.twig', [
            'licenses' => $licenses,
            'loadError' => $this->licenseService->getLastError(),
            'page' => [
                'title' => 'My licenses',
            ],
        ]);
    }
}
